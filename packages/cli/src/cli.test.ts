import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

import { atomicText } from './local-files.ts';

const binary = fileURLToPath(new URL('../dist/backbricks.js', import.meta.url));
const project = 'prj_00000000000000000000000001';
const schema = 'https://backbricks.app/schema/config.v1.json';
const config = { $schema: schema, project, modules: {} };

async function directory(run: (cwd: string) => Promise<void>) {
  const cwd = await mkdtemp(join(tmpdir(), 'backbricks-cli-'));
  try {
    await run(cwd);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

async function cli(cwd: string, args: string[], environment?: Record<string, string>) {
  const child = Bun.spawn(['node', binary, ...args], {
    cwd,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    env: { PATH: process.env['PATH'], BACKBRICKS_CONFIG_HOME: join(cwd, 'auth'), ...environment },
  });
  const [status, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { status, stdout, stderr };
}

test('validates a configuration file offline and reports structured errors', async () => {
  await directory(async (cwd) => {
    const path = join(cwd, 'backbricks.config.json');
    await writeFile(path, JSON.stringify(config));
    const valid = await cli(cwd, ['validate', '--json']);
    expect(valid.status).toBe(0);
    expect(JSON.parse(valid.stdout)).toMatchObject({ valid: true, project });
    await writeFile(path, JSON.stringify({ ...config, modules: { unknown: {} } }));
    const denied = await cli(cwd, ['validate', '--json']);
    expect(denied.status).toBe(2);
    expect(JSON.parse(denied.stdout)).toMatchObject({ code: 'invalid_config' });
    expect(denied.stderr).toBe('');
  });
});

test('workspace links cannot redirect an ambient credential and CLI parse errors redact keys', async () => {
  await directory(async (cwd) => {
    const secret = `bb_sk_${'c'.repeat(32)}`;
    let received = 0;
    const server = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      fetch() {
        received++;
        return new Response(null, { status: 403 });
      },
    });
    try {
      await mkdir(join(cwd, '.backbricks'));
      await writeFile(
        join(cwd, '.backbricks', 'target.json'),
        JSON.stringify({ baseUrl: server.url.href, project }),
      );
      await writeFile(join(cwd, 'backbricks.config.json'), JSON.stringify(config));
      const diff = await cli(cwd, ['diff', '--json'], { BACKBRICKS_SECRET_KEY: secret });
      expect(diff.status).toBe(2);
      expect(JSON.parse(diff.stdout)).toMatchObject({ code: 'untrusted_credential_target' });
      expect(received).toBe(0);
      const parse = await cli(cwd, [secret]);
      expect(parse.status).toBe(2);
      expect(parse.stderr).toContain('[redacted]');
      expect(parse.stderr).not.toContain(secret);
    } finally {
      await server.stop(true);
    }
  });
});

test('links a site and applies exactly the approved plan', async () => {
  await directory(async (cwd) => {
    const secret = `bb_sk_${'s'.repeat(32)}`;
    const publicKey = `bb_pk_${'p'.repeat(32)}`;
    const requests: { dryRun: string | null; body: unknown }[] = [];
    let destructive = true;
    const server = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      async fetch(request) {
        const url = new URL(request.url);
        expect(request.headers.get('authorization')).toBe(`Bearer ${secret}`);
        if (url.pathname.endsWith('/integration')) {
          return Response.json({
            baseUrl: new URL('/v1', url).href,
            publicKey,
            project: { id: project, name: 'Fixture', allowedOrigins: [] },
            modules: [],
          });
        }
        if (request.method === 'GET') return Response.json(config);
        const dryRun = url.searchParams.get('dryRun');
        requests.push({ dryRun, body: await request.json() });
        return Response.json(
          dryRun === 'true'
            ? { changes: [{}], destructive, warnings: [], planHash: 'fixture-plan' }
            : { applied: true, changes: [], warnings: [] },
        );
      },
    });
    try {
      const global = ['--base-url', server.url.href, '--project', project, '--json', '--yes'];
      const keyEnv = { BACKBRICKS_SECRET_KEY: secret };
      const login = await cli(cwd, [...global, 'login'], keyEnv);
      expect(login.status).toBe(0);
      expect(login.stdout).not.toContain(secret);
      expect((await stat(join(cwd, 'auth', 'credentials'))).mode & 0o777).toBe(0o600);
      await writeFile(join(cwd, 'package.json'), JSON.stringify({ dependencies: { next: '16' } }));
      const init = await cli(cwd, [...global, 'init', '--agents']);
      expect(init.status).toBe(0);
      expect(await readFile(join(cwd, '.env.local'), 'utf8')).toContain(
        `NEXT_PUBLIC_BACKBRICKS_KEY=${publicKey}`,
      );
      expect(await readFile(join(cwd, '.gitignore'), 'utf8')).toContain('.backbricks/');
      expect((await cli(cwd, ['init', '--agents', '--json', '--yes'])).status).toBe(0);
      expect(
        (await readFile(join(cwd, 'AGENTS.md'), 'utf8')).match(/<!-- backbricks -->/g),
      ).toHaveLength(1);
      expect((await cli(cwd, ['push', '--yes', '--json'])).status).toBe(4);
      expect(requests.map(({ dryRun }) => dryRun)).toEqual(['true']);
      destructive = false;
      const push = await cli(cwd, ['push', '--yes', '--json']);
      expect(push.status).toBe(0);
      expect(requests.slice(1)).toEqual([
        { dryRun: 'true', body: { config } },
        { dryRun: 'false', body: { config, planHash: 'fixture-plan' } },
      ]);
    } finally {
      await server.stop(true);
    }
  });
});

test('doctor identifies a public key exposure without revealing its value', async () => {
  await directory(async (cwd) => {
    const secret = `bb_sk_${'d'.repeat(32)}`;
    const output = await cli(cwd, ['doctor', '--json'], { NEXT_PUBLIC_BACKBRICKS_SECRET: secret });
    expect(output.status).toBe(6);
    expect(output.stderr).toBe('');
    expect(output.stdout).not.toContain(secret);
    expect(JSON.parse(output.stdout)).toMatchObject({
      code: 'public_secret_exposure',
      variables: ['NEXT_PUBLIC_BACKBRICKS_SECRET'],
    });
  });
});

test('doctor confines build scans and conditional writes preserve intervening edits', async () => {
  await directory(async (root) => {
    const cwd = join(root, 'site');
    const outside = join(root, 'outside');
    await mkdir(cwd);
    await mkdir(join(outside, 'static'), { recursive: true });
    await writeFile(join(outside, 'static', 'bundle.js'), `bb_sk_${'e'.repeat(32)}`);
    await symlink(outside, join(cwd, '.next'), 'dir');
    const scanned = await cli(cwd, ['doctor', '--json']);
    expect(JSON.parse(scanned.stdout)).toMatchObject({ code: 'missing_target' });
    const configPath = join(cwd, 'backbricks.config.json');
    await writeFile(configPath, 'owner edit');
    expect(
      await atomicText(configPath, 'initial config', { current: undefined }).catch(
        (error: unknown) => error,
      ),
    ).toMatchObject({ code: 'local_file_changed' });
    expect(await readFile(configPath, 'utf8')).toBe('owner edit');
  });
});

test.each(['node', 'bun'])(
  'stdio MCP applies the exact form upsert plan on %s',
  async (runtime) => {
    await directory(async (cwd) => {
      const requests: { path: string; body?: unknown }[] = [];
      const server = Bun.serve({
        port: 0,
        hostname: '127.0.0.1',
        async fetch(request) {
          const path = new URL(request.url).pathname;
          requests.push({
            path,
            ...(request.method === 'PUT' ? { body: await request.json() } : {}),
          });
          if (request.method === 'GET') return Response.json(config);
          if (path.includes('/mcp/'))
            return Response.json({ applied: true, changes: [], warnings: [] });
          return Response.json({
            changes: [],
            warnings: [],
            destructive: false,
            planHash: 'planned-fixture',
          });
        },
      });
      const transport = new StdioClientTransport({
        command: runtime,
        args: [binary, 'mcp', '--base-url', server.url.href, '--project', project],
        cwd,
        env: { BACKBRICKS_SECRET_KEY: `bb_sk_${'s'.repeat(32)}` },
      });
      const client = new Client({ name: 'backbricks-cli-test', version: '1' });
      try {
        await client.connect(transport);
        const { tools } = await client.listTools();
        expect(tools.map(({ name }) => name)).toContain('form_upsert');
        expect(tools.every(({ name }) => !/delete|revoke|keys/.test(name))).toBe(true);
        const result = await client.callTool({
          name: 'form_upsert',
          arguments: {
            key: 'contact',
            name: 'Contact',
            config: {
              fields: [{ key: 'email', label: 'Email', type: 'email' }],
            },
          },
        });
        expect(result.isError).toBeUndefined();
        expect(requests).toHaveLength(3);
        expect(requests[2]).toMatchObject({
          path: `/v1/projects/${project}/mcp/config`,
          body: {
            planHash: 'planned-fixture',
            config: { modules: { forms: { contact: { name: 'Contact' } } } },
          },
        });
      } finally {
        await client.close();
        await server.stop(true);
      }
    });
  },
);
