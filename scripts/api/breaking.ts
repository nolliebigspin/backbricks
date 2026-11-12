import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { CONTRACT_PATH, REPOSITORY_ROOT } from './paths.ts';

/**
 * The environment without the variables that pin git to one repository. Git exports `GIT_DIR`
 * to hooks, as an absolute path in linked worktrees, so without this a pre-push run would send
 * git commands meant for `cwd` (fixture repositories included) to the real repository.
 */
export function gitEnvironment(): Record<string, string> {
  const pinned = new Set(
    Bun.spawnSync(['git', 'rev-parse', '--local-env-vars']).stdout.toString().split('\n'),
  );
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined && !pinned.has(entry[0]),
    ),
  );
}
async function git(cwd: string, args: string[]) {
  const child = Bun.spawn(['git', ...args], {
    cwd,
    env: gitEnvironment(),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0)
    throw new Error(`Git history is unavailable for API comparison: ${stderr.trim()}`);
  return stdout.trim();
}
/** Baseline absence is allowed only after resolving a real base commit and inspecting its tree. */
export async function checkApiBreaking(options: { cwd?: string; base?: string } = {}) {
  const cwd = options.cwd ?? REPOSITORY_ROOT;
  const current = join(cwd, CONTRACT_PATH);
  if (!(await Bun.file(current).exists()))
    throw new Error('The current API contract is missing. Run bun run api:generate.');
  JSON.parse(await Bun.file(current).text());
  const ref = options.base ?? (await git(cwd, ['merge-base', 'HEAD', 'origin/main']));
  const base = await git(cwd, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]);
  const file = await git(cwd, ['ls-tree', '--name-only', base, '--', CONTRACT_PATH]);
  if (file === '') return { base, bootstrap: true };
  const before = await git(cwd, ['show', `${base}:${CONTRACT_PATH}`]);
  await mkdir(join(cwd, '.turbo'), { recursive: true });
  const directory = await mkdtemp(join(cwd, '.turbo/api-breaking-'));
  try {
    const baseline = join(directory, 'base.json');
    const config = join(directory, 'config.yaml');
    await Bun.write(baseline, before);
    await Bun.write(config, '{}\n');
    const child = Bun.spawn(
      [
        'mise',
        'exec',
        '--',
        'oasdiff',
        'breaking',
        baseline,
        current,
        '--fail-on',
        'ERR',
        '--allow-external-refs=false',
        '--match-path',
        '^/v1(/|$)',
        '--config',
        config,
      ],
      { cwd: REPOSITORY_ROOT, stdout: 'pipe', stderr: 'pipe' },
    );
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (code !== 0)
      throw new Error(`API compatibility check failed against ${base}:\n${stdout}${stderr}`);
    return { base, bootstrap: false };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--base' || !args[1]))
    throw new Error('Usage: bun run api:breaking [--base COMMIT]');
  const result = await checkApiBreaking({ base: args[1] });
  process.stdout.write(
    result.bootstrap
      ? `API baseline bootstrap: ${result.base} has no contract.\n`
      : `API compatibility passed against ${result.base}.\n`,
  );
}
