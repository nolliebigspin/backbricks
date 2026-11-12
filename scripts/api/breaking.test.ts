import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { checkApiBreaking, gitEnvironment } from './breaking.ts';
import { CONTRACT_PATH, REPOSITORY_ROOT } from './paths.ts';

const operation = {
  responses: {
    '200': {
      description: 'OK',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['value'],
            properties: { value: { type: 'string' } },
          },
        },
      },
    },
  },
};
const baseline = {
  openapi: '3.1.0',
  info: { title: 'Fixture', version: '1' },
  paths: { '/v1/things': { get: operation }, '/v2/legacy': { get: operation } },
};
async function fixture(
  run: (directory: string, git: (args: string[]) => Promise<string>) => Promise<void>,
) {
  await mkdir(join(REPOSITORY_ROOT, '.turbo'), { recursive: true });
  const directory = await mkdtemp(join(REPOSITORY_ROOT, '.turbo/api-history-fixture-'));
  const git = async (args: string[]) => {
    const child = Bun.spawn(
      ['git', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', ...args],
      { cwd: directory, env: gitEnvironment(), stdout: 'pipe', stderr: 'pipe' },
    );
    const [output, error, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (code !== 0) throw new Error(`Fixture git failed: ${error}`);
    return output.trim();
  };
  try {
    await git(['init', '-b', 'main']);
    await run(directory, git);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
async function write(directory: string, document: unknown) {
  await Bun.write(join(directory, CONTRACT_PATH), JSON.stringify(document));
}

test('oasdiff accepts additive v1 changes and rejects removal/type changes against an actual base commit', async () => {
  await fixture(async (directory, git) => {
    await write(directory, baseline);
    await git(['add', CONTRACT_PATH]);
    await git(['commit', '-s', '-m', 'test: baseline fixture']);
    const base = await git(['rev-parse', 'HEAD']);
    await git(['update-ref', 'refs/remotes/origin/main', base]);
    await write(directory, {
      ...baseline,
      paths: { ...baseline.paths, '/v1/addition': { get: operation } },
    });
    expect(await checkApiBreaking({ cwd: directory })).toEqual({ base, bootstrap: false });
    await write(directory, { ...baseline, paths: { '/v2/legacy': baseline.paths['/v2/legacy'] } });
    expect(
      await checkApiBreaking({ cwd: directory, base }).catch((error: unknown) => error),
    ).toMatchObject({ message: expect.stringContaining('API compatibility check failed') });
    const changed = structuredClone(baseline);
    changed.paths['/v1/things'].get.responses['200'].content[
      'application/json'
    ].schema.properties.value.type = 'integer';
    await write(directory, changed);
    expect(
      await checkApiBreaking({ cwd: directory, base }).catch((error: unknown) => error),
    ).toMatchObject({ message: expect.stringContaining('API compatibility check failed') });
    await write(directory, { ...baseline, paths: { '/v1/things': baseline.paths['/v1/things'] } });
    expect((await checkApiBreaking({ cwd: directory, base })).bootstrap).toBe(false);
  });
}, 20_000);

test('a hook-exported GIT_DIR (linked worktree) never redirects git away from cwd', async () => {
  await fixture(async (decoy, decoyGit) => {
    await decoyGit(['commit', '--allow-empty', '-s', '-m', 'test: decoy']);
    const decoyHead = await decoyGit(['rev-parse', 'HEAD']);
    await fixture(async (directory, git) => {
      await write(directory, baseline);
      await git(['add', CONTRACT_PATH]);
      await git(['commit', '-s', '-m', 'test: worktree fixture']);
      const base = await git(['rev-parse', 'HEAD']);
      await git(['update-ref', 'refs/remotes/origin/main', base]);
      // Bun.spawn copies the environment at start-up, so the hook's variable must reach a new process.
      const child = Bun.spawn(
        [
          process.execPath,
          '--eval',
          `const { checkApiBreaking } = await import(${JSON.stringify(join(import.meta.dir, 'breaking.ts'))});
           console.log(JSON.stringify(await checkApiBreaking({ cwd: process.env.FIXTURE })));`,
        ],
        {
          env: { ...process.env, GIT_DIR: join(decoy, '.git'), FIXTURE: directory },
          stdout: 'pipe',
          stderr: 'pipe',
        },
      );
      const [output, error, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      expect({ code, error: code === 0 ? '' : error }).toEqual({ code: 0, error: '' });
      expect(JSON.parse(output)).toEqual({ base, bootstrap: false });
    });
    expect(await decoyGit(['rev-parse', 'HEAD'])).toBe(decoyHead);
  });
}, 20_000);

test('bootstrap requires a real base with no contract; missing refs/history never silently bootstrap', async () => {
  await fixture(async (directory, git) => {
    await Bun.write(join(directory, 'fixture.txt'), 'Initial history');
    await git(['add', 'fixture.txt']);
    await git(['commit', '-s', '-m', 'test: bootstrap fixture']);
    const base = await git(['rev-parse', 'HEAD']);
    await write(directory, baseline);
    expect(await checkApiBreaking({ cwd: directory, base })).toEqual({ base, bootstrap: true });
    expect(
      await checkApiBreaking({ cwd: directory, base: 'missing-reference' }).catch(
        (error: unknown) => error,
      ),
    ).toMatchObject({ message: expect.stringContaining('Git history is unavailable') });
    expect(
      await checkApiBreaking({ cwd: directory }).catch((error: unknown) => error),
    ).toMatchObject({ message: expect.stringContaining('Git history is unavailable') });
  });
});
