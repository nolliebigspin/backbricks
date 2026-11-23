import { dirname, join } from 'node:path';

import { CliError, exit } from './errors.ts';
import {
  asRecord,
  atomicText,
  jsonText,
  optionalText,
  readJson,
  requireDirectoryIfPresent,
} from './local-files.ts';
import { integration, management, responseData, scope } from './management.ts';
import {
  apiBaseUrl,
  CONFIG_FILE,
  TARGET_FILE,
  trustEnvironmentCredential,
  type Target,
} from './target.ts';

export const frameworks = ['nextjs', 'astro', 'vue', 'nuxt', 'html'] as const;
export type Framework = (typeof frameworks)[number];

const envPrefixes = {
  nextjs: 'NEXT_PUBLIC_',
  astro: 'PUBLIC_',
  vue: 'VITE_',
  nuxt: 'NUXT_PUBLIC_',
  html: 'PUBLIC_',
} as const satisfies Record<Framework, string>;
export const publicPrefixes = [...new Set(Object.values(envPrefixes))];

export async function frameworkFor(root: string, explicit?: Framework): Promise<Framework> {
  if (explicit) return explicit;
  const manifest = asRecord(readJson(await optionalText(join(root, 'package.json'))));
  const dependencies = {
    ...asRecord(manifest?.['dependencies']),
    ...asRecord(manifest?.['devDependencies']),
  };
  if ('next' in dependencies) return 'nextjs';
  if ('nuxt' in dependencies) return 'nuxt';
  if ('astro' in dependencies) return 'astro';
  return 'vite' in dependencies || 'vue' in dependencies ? 'vue' : 'html';
}

function append(text: string, lines: readonly string[]) {
  if (lines.length === 0) return text;
  const boundary = text && !text.endsWith('\n') ? '\n' : '';
  return `${text}${boundary}${lines.join('\n')}\n`;
}

function variable(text: string, name: string, value: string): string[] {
  const pattern = new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=\\s*(.*?)\\s*$`);
  const existing = text.split(/\r?\n/).flatMap((line) => {
    const entry = pattern.exec(line)?.[1];
    return entry === undefined ? [] : [entry.replace(/^(['"])(.*)\1$/, '$2')];
  });
  if (existing.some((entry) => entry !== value))
    throw new CliError(
      'conflicting_environment',
      `Review the existing ${name} in .env.local before linking.`,
    );
  return existing.length === 0 ? [`${name}=${value}`] : [];
}

export async function currentConfig(target: Target) {
  const api = await management(target);
  return responseData(await api.GET('/v1/projects/{projectId}/config', { params: scope(target) }));
}

export async function initialize(
  root: string,
  target: Target,
  input: { framework?: Framework; agents?: boolean },
) {
  const [info, remote, framework] = await Promise.all([
    integration(target),
    currentConfig(target),
    frameworkFor(root, input.framework),
  ]);
  if (remote.project !== target.project)
    throw new CliError('wrong_project', 'The API returned a different project.', exit.remote);
  if (typeof info.publicKey !== 'string' || !/^bb_pk_[a-zA-Z0-9]+$/.test(info.publicKey))
    throw new CliError(
      'missing_publishable_key',
      'Ask the project owner to create an active publishable key.',
    );
  const publicUrl = `${apiBaseUrl(info.baseUrl)}/v1`;
  const configPath = join(root, CONFIG_FILE);
  const targetPath = join(root, TARGET_FILE);
  const envPath = join(root, '.env.local');
  const ignorePath = join(root, '.gitignore');
  const agentsPath = join(root, 'AGENTS.md');
  await requireDirectoryIfPresent(dirname(targetPath));

  const [local, rawTarget, env, ignore, agentInstructions] = await Promise.all([
    optionalText(configPath),
    optionalText(targetPath),
    optionalText(envPath),
    optionalText(ignorePath),
    input.agents ? optionalText(agentsPath) : undefined,
  ]);

  if (local !== undefined && asRecord(readJson(local))?.['project'] !== target.project)
    throw new CliError('wrong_project', 'The existing configuration belongs to another project.');
  if (rawTarget !== undefined) {
    const existing = asRecord(readJson(rawTarget));
    if (existing?.['baseUrl'] !== target.baseUrl || existing['project'] !== target.project)
      throw new CliError(
        'wrong_project',
        'The existing site link points to another API or project.',
      );
  }

  const prefix = envPrefixes[framework];
  const envText = env ?? '';
  const envUpdate = append(envText, [
    ...variable(envText, `${prefix}BACKBRICKS_KEY`, info.publicKey),
    ...variable(envText, `${prefix}BACKBRICKS_URL`, publicUrl),
  ]);
  const ignoreText = ignore ?? '';
  const ignoreUpdate = append(
    ignoreText,
    ['.env.local', '.backbricks/'].filter((entry) => !ignoreText.split(/\r?\n/).includes(entry)),
  );

  if (ignoreUpdate !== ignoreText) await atomicText(ignorePath, ignoreUpdate, { current: ignore });
  if (envUpdate !== envText) await atomicText(envPath, envUpdate, { current: env });
  if (local === undefined) await atomicText(configPath, jsonText(remote), { current: local });
  if (rawTarget === undefined)
    await atomicText(targetPath, jsonText({ baseUrl: target.baseUrl, project: target.project }), {
      current: rawTarget,
    });
  await trustEnvironmentCredential(target);

  const marker = '<!-- backbricks -->';
  if (input.agents && !agentInstructions?.includes(marker)) {
    await atomicText(
      agentsPath,
      append(agentInstructions ?? '', [
        '',
        marker,
        '## Backbricks',
        '',
        'Run `backbricks docs --agent` for the integration workflow. Keep secret keys in server-only environments.',
        '<!-- /backbricks -->',
      ]),
      { current: agentInstructions },
    );
  }
  return { project: target.project, framework, config: CONFIG_FILE };
}
