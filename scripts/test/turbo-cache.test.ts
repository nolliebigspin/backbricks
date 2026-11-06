import { expect, test } from 'bun:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { z } from 'zod';

const root = resolve(import.meta.dir, '../..');
const taskSchema = z.object({
  taskId: z.string(),
  hash: z.string(),
  resolvedTaskDefinition: z.object({ cache: z.boolean() }),
});
const dryRunSchema = z.object({ tasks: z.array(taskSchema) });

const hash = (result: z.infer<typeof dryRunSchema>) => {
  const task = result.tasks.find((entry) => entry.taskId === '@fixture/b#typecheck');
  if (!task) throw new Error('Expected dependent typecheck task');
  return task.hash;
};

test('Turbo sees dependency/shared-helper changes and never caches live-service tests', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'backbricks-turbo-'));
  async function run(command: string[]) {
    const child = Bun.spawn(command, {
      cwd: directory,
      stdout: 'pipe',
      stderr: 'pipe',
      env: { PATH: process.env['PATH'] ?? '', TURBO_TELEMETRY_DISABLED: '1' },
    });
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (code !== 0) throw new Error(`Fixture command failed: ${stderr}`);
    return stdout;
  }
  async function graph() {
    return dryRunSchema.parse(
      JSON.parse(
        await run([
          join(root, 'node_modules/.bin/turbo'),
          'run',
          'typecheck',
          'test',
          '--dry=json',
        ]),
      ),
    );
  }
  try {
    await Promise.all(
      ['packages/a/src', 'packages/b/src', 'scripts/test'].map((path) =>
        mkdir(join(directory, path), { recursive: true }),
      ),
    );
    const manager = z
      .object({ packageManager: z.string() })
      .parse(JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))).packageManager;
    await Promise.all([
      writeFile(
        join(directory, 'package.json'),
        JSON.stringify({
          name: 'cache-fixture',
          private: true,
          packageManager: manager,
          workspaces: ['packages/*'],
        }),
      ),
      writeFile(
        join(directory, 'packages/a/package.json'),
        JSON.stringify({ name: '@fixture/a', version: '1.0.0' }),
      ),
      writeFile(
        join(directory, 'packages/b/package.json'),
        JSON.stringify({
          name: '@fixture/b',
          version: '1.0.0',
          dependencies: { '@fixture/a': 'workspace:*' },
          scripts: { typecheck: 'tsc', test: 'bun test' },
        }),
      ),
      writeFile(join(directory, '.gitignore'), 'node_modules\n.turbo\n'),
      writeFile(join(directory, 'tsconfig.base.json'), '{}'),
      writeFile(join(directory, 'packages/a/src/index.ts'), 'export type Value = string;'),
      writeFile(join(directory, 'packages/b/src/index.ts'), 'export {};'),
      writeFile(join(directory, 'scripts/test/shared.ts'), 'export const shared = 1;'),
      writeFile(join(directory, 'turbo.json'), await readFile(join(root, 'turbo.json'), 'utf8')),
    ]);
    await run([process.execPath, 'install', '--ignore-scripts']);
    await run(['git', 'init', '-q']);
    await run(['git', 'add', '.']);
    const initial = await graph();
    expect(
      initial.tasks.find((entry) => entry.taskId === '@fixture/b#test')?.resolvedTaskDefinition
        .cache,
    ).toBe(false);
    await writeFile(join(directory, 'packages/a/src/index.ts'), 'export type Value = number;');
    const dependencyChange = await graph();
    expect(hash(dependencyChange)).not.toBe(hash(initial));
    await writeFile(join(directory, 'scripts/test/shared.ts'), 'export const shared = 2;');
    expect(hash(await graph())).not.toBe(hash(dependencyChange));
    // Negative control: the original independent task silently misses dependency changes.
    await writeFile(
      join(directory, 'turbo.json'),
      JSON.stringify({ tasks: { typecheck: {}, test: { cache: false } } }),
    );
    const unscoped = await graph();
    await writeFile(join(directory, 'packages/a/src/index.ts'), 'export type Value = boolean;');
    expect(hash(await graph())).toBe(hash(unscoped));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 15_000);
