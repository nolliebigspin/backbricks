import { lstat, opendir, readFile, realpath } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

import { environment } from './environment.config.ts';
import { CliError, exit, redact, secretMarker } from './errors.ts';
import { optionalText } from './local-files.ts';
import { integration } from './management.ts';
import { publicPrefixes } from './project-files.ts';
import type { Target } from './target.ts';

const buildRoots = ['dist', 'build', '.next/static', '.output/public', 'out'];
const envFiles = [
  '.env',
  '.env.local',
  '.env.production',
  '.env.production.local',
  '.env.development',
  '.env.development.local',
];
const MAX_FILES = 2_000;
const MAX_BUILD_BYTES = 8 * 1024 * 1024;
const MAX_DEPTH = 16;

function isPublic(name: string) {
  return publicPrefixes.some((prefix) => name.startsWith(prefix));
}

async function scanBuild(root: string) {
  const realRoot = await realpath(root);
  const hits = new Set<string>();
  let scanned = 0;
  let truncated = false;
  const folders: { path: string; depth: number }[] = buildRoots.map((folder) => ({
    path: join(root, folder),
    depth: 0,
  }));
  while (folders.length > 0 && scanned < MAX_FILES) {
    const folder = folders.pop();
    if (!folder) break;
    let directory;
    try {
      // oxlint-disable-next-line no-await-in-loop -- Traversal has a single shared work budget.
      if (!(await lstat(folder.path)).isDirectory()) continue;
      // oxlint-disable-next-line no-await-in-loop -- Check containment before opening the directory.
      if (!(await realpath(folder.path)).startsWith(`${realRoot}${sep}`)) continue;
      // oxlint-disable-next-line no-await-in-loop -- Read one bounded directory at a time.
      directory = await opendir(folder.path);
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT')
        continue;
      throw error;
    }
    // oxlint-disable-next-line no-await-in-loop -- Stream each directory without reading it into memory.
    for await (const entry of directory) {
      scanned += 1;
      if (scanned > MAX_FILES) {
        truncated = true;
        break;
      }
      const path = join(folder.path, entry.name);
      if (entry.isDirectory()) {
        if (folder.depth < MAX_DEPTH) folders.push({ path, depth: folder.depth + 1 });
        else truncated = true;
      } else if (
        entry.isFile() &&
        /\.(?:html|xhtml|mjs|cjs|js|css|json|txt|map|svg)$/i.test(entry.name)
      ) {
        const info = await lstat(path);
        if (!info.isFile()) continue;
        if (info.size > MAX_BUILD_BYTES) {
          truncated = true;
          continue;
        }
        const contents = await readFile(path, 'utf8');
        if (secretMarker.test(contents)) hits.add(redact(relative(root, path)));
      }
    }
  }
  return { hits: [...hits].toSorted(), truncated: truncated || folders.length > 0 };
}

export async function doctor(root: string, getTarget: () => Promise<Target>, origin?: string) {
  const variables = Object.entries(environment().variables)
    .filter(([name, value]) => isPublic(name) && secretMarker.test(value ?? ''))
    .map(([name]) => redact(name));
  const fileHits = await Promise.all(
    envFiles.map(async (name) => {
      const text = await optionalText(join(root, name));
      return (text ?? '').split(/\r?\n/).flatMap((line) => {
        const match = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
        const variable = match?.[1];
        return variable && isPublic(variable) && secretMarker.test(match?.[2] ?? '')
          ? [`${name}:${redact(variable)}`]
          : [];
      });
    }),
  );
  const build = await scanBuild(root);
  if (variables.length || fileHits.some((list) => list.length) || build.hits.length) {
    throw new CliError(
      'public_secret_exposure',
      'Remove secret keys from public variables and rebuild the site.',
      exit.diagnostic,
      {
        variables: [...variables, ...fileHits.flat()].toSorted(),
        files: build.hits,
      },
    );
  }
  if (build.truncated)
    throw new CliError(
      'incomplete_build_scan',
      'The scan exceeded its static build limit.',
      exit.diagnostic,
    );
  const target = await getTarget();
  const info = await integration(target);
  if (
    !info.publicKey ||
    !info.project.allowedOrigins.length ||
    (origin && !info.project.allowedOrigins.includes(origin))
  ) {
    throw new CliError(
      'integration_incomplete',
      'Check that Project Embed has an active publishable key and the exact website origin.',
      exit.diagnostic,
      {
        project: target.project,
        allowedOrigins: info.project.allowedOrigins,
        activePublishableKey: info.publicKey !== null,
      },
    );
  }
  return {
    project: target.project,
    allowedOrigins: info.project.allowedOrigins,
    publicSecretScan: 'passed',
  };
}
