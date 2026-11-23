import { join } from 'node:path';

import { CliError, exit } from './errors.ts';
import { atomicText, jsonText, optionalText, readJson } from './local-files.ts';
import { management, responseData, scope, type ConfigInput } from './management.ts';
import { currentConfig } from './project-files.ts';
import { CONFIG_FILE, type Target } from './target.ts';
import { validateConfig } from './validation.ts';

export async function readConfig(root: string) {
  const path = join(root, CONFIG_FILE);
  const text = await optionalText(path);
  if (text === undefined) throw new CliError('missing_config', 'Run backbricks init first.');
  return { path, text, document: validateConfig(readJson(text)) };
}

export async function plan(target: Target, config: ConfigInput) {
  if (config.project !== target.project)
    throw new CliError('wrong_project', 'The configuration and selected project must match.');
  const api = await management(target);
  const result = responseData(
    await api.PUT('/v1/projects/{projectId}/config', {
      params: { ...scope(target), query: { dryRun: 'true' } },
      body: { config },
    }),
  );
  if (!('planHash' in result))
    throw new CliError('invalid_plan', 'The server did not return a plan.', exit.remote);
  return result;
}

export async function apply(
  target: Target,
  config: ConfigInput,
  planHash: string,
  channel: 'cli' | 'mcp' = 'cli',
) {
  if (config.project !== target.project)
    throw new CliError('wrong_project', 'The configuration and selected project must match.');
  const api = await management(target);
  if (channel === 'mcp')
    return responseData(
      await api.PUT('/v1/projects/{projectId}/mcp/config', {
        params: scope(target),
        body: { config, planHash },
      }),
    );
  const result = responseData(
    await api.PUT('/v1/projects/{projectId}/config', {
      params: { ...scope(target), query: { dryRun: 'false' } },
      body: { config, planHash },
    }),
  );
  if (!('applied' in result))
    throw new CliError('invalid_response', 'The server did not confirm config apply.', exit.remote);
  return result;
}

type Confirm = (message: string) => Promise<boolean>;

export async function pull(root: string, target: Target, confirm: Confirm) {
  const path = join(root, CONFIG_FILE);
  const before = await optionalText(path);
  const remote = await currentConfig(target);
  if (remote.project !== target.project)
    throw new CliError('wrong_project', 'The API returned a different project.', exit.remote);
  const text = jsonText(remote);
  if (before !== text) {
    if (before !== undefined && !(await confirm('Replace the local Backbricks configuration?')))
      throw new CliError(
        'confirmation_required',
        'Use --yes to confirm replacing the local configuration.',
        exit.confirmation,
      );
    await atomicText(path, text, { current: before });
  }
  return { project: target.project, config: CONFIG_FILE, changed: before !== text };
}

export async function push(
  root: string,
  target: Target,
  allowDestructive: boolean,
  confirm: Confirm,
  showPlan: (plan: object) => void,
) {
  const local = await readConfig(root);
  const proposed = await plan(target, local.document);
  if (proposed.destructive && !allowDestructive) {
    throw new CliError(
      'destructive_plan',
      'Review the plan and explicitly allow destructive changes with --allow-destructive.',
      exit.confirmation,
      {
        changes: proposed.changes,
        warnings: proposed.warnings,
      },
    );
  }
  if (proposed.changes.length === 0)
    return { applied: false, changes: [], warnings: proposed.warnings };
  showPlan({
    changes: proposed.changes,
    warnings: proposed.warnings,
    destructive: proposed.destructive,
  });
  if (
    !(await confirm(
      proposed.destructive
        ? `Apply ${proposed.changes.length} changes including destructive changes?`
        : `Apply ${proposed.changes.length} configuration changes?`,
    ))
  )
    throw new CliError(
      'confirmation_required',
      'Use --yes to apply the plan non-interactively.',
      exit.confirmation,
    );
  if ((await optionalText(local.path)) !== local.text)
    throw new CliError(
      'local_config_changed',
      'The local configuration changed after planning.',
      exit.local,
    );
  const result = await apply(target, local.document, proposed.planHash);
  try {
    const remote = await currentConfig(target);
    if (remote.project !== target.project || (await optionalText(local.path)) !== local.text)
      return { ...result, localSynced: false };
    const modules = Object.fromEntries(
      Object.keys(local.document.modules).map((section) => [
        section,
        remote.modules[section] ?? {},
      ]),
    );
    await atomicText(local.path, jsonText({ ...remote, modules }), { current: local.text });
    return { ...result, localSynced: true };
  } catch {
    // A failed readback cannot undo an already committed apply.
    return { ...result, localSynced: false };
  }
}
