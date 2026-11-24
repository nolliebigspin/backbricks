// SPDX-License-Identifier: AGPL-3.0-only

import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function command(
  args: string[],
  input?: string,
  env?: Record<string, string | undefined>,
) {
  const child = Bun.spawn(args, {
    stdin: input === undefined ? 'ignore' : new Blob([input]),
    stdout: 'pipe',
    env,
    stderr: 'pipe',
  });
  const [status, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { status, stdout, stderr };
}

export async function run(args: string[], input?: string) {
  const result = await command(args, input);
  if (result.status !== 0)
    throw new Error(`${args.slice(0, 3).join(' ')} failed (${result.status}): ${result.stderr}`);
  return result.stdout;
}

function freePort() {
  const socket = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response() });
  const port = socket.port;
  void socket.stop();
  if (!port) throw new Error('No loopback port available.');
  return port;
}

export async function deployment(image: string, modules: string, tls: boolean, scan = false) {
  const directory = await mkdtemp(join(tmpdir(), 'backbricks-p6-'));
  const project = `bb-p6-${crypto.randomUUID().slice(0, 12)}`;
  const localPort = freePort();
  const httpsPort = freePort();
  const origin = tls ? `https://localhost:${httpsPort}` : 'https://backbricks.example.invalid';
  const env = join(directory, '.env');
  await cp('deploy/compose', directory, {
    recursive: true,
    filter: (source) =>
      !['.env', 'garage.toml', 'restic-password', 'backup-repository'].includes(
        source.split('/').at(-1) ?? '',
      ),
  });
  await run([
    'node',
    'packages/cli/dist/backbricks.js',
    'deploy',
    'configure',
    '--public-url',
    origin,
    '--image',
    image,
    '--modules',
    modules,
    '--out',
    directory,
    ...(tls ? ['--backup'] : ['--no-tls']),
    ...(scan ? ['--scan'] : []),
  ]);
  await writeFile(env, `BACKBRICKS_LOCAL_PORT=${localPort}\nHTTP_PORT=${freePort()}\n`, {
    flag: 'a',
  });
  const args = (name: string, rest: string[]) => [
    'docker',
    'compose',
    '--project-name',
    name,
    '--env-file',
    env,
    '-f',
    join(directory, 'compose.yaml'),
    ...rest,
  ];
  const runCompose = (name: string, rest: string[], input?: string) => run(args(name, rest), input);
  const stop = (name: string) => runCompose(name, ['down', '-v', '--remove-orphans']);
  return {
    directory,
    project,
    origin,
    async setImage(reference: string) {
      if (!/^[a-zA-Z0-9_.:/@-]+$/.test(reference)) throw new Error('Invalid fixture image.');
      const previous = await readFile(env, 'utf8');
      await writeFile(
        env,
        previous.replace(/^BACKBRICKS_IMAGE=.*$/m, `BACKBRICKS_IMAGE=${reference}`),
      );
    },
    local: `http://127.0.0.1:${localPort}`,
    compose: (rest: string[], input?: string) => runCompose(project, rest, input),
    command: (rest: string[], input?: string) => command(args(project, rest), input),
    restore: (rest: string[], input?: string) => runCompose(`${project}-restore`, rest, input),
    async cleanup() {
      try {
        await stop(project);
        await stop(`${project}-restore`);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  };
}
