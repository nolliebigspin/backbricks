import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

import adminCatalog from './generated/admin-commands.json';
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

test('administrative reads use scoped credentials and private downloads stream without forwarding credentials', async () => {
  await directory(async (cwd) => {
    const secret = `bb_sk_${'r'.repeat(32)}`;
    const bytes = 'private fixture bytes';
    let operationCalls = 0;
    const server = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      async fetch(request) {
        const url = new URL(request.url);
        if (url.pathname === '/object') {
          expect(request.headers.get('authorization')).toBe(null);
          expect(request.headers.get('cookie')).toBe(null);
          return new Response(bytes);
        }
        expect(request.headers.get('authorization')).toBe(`Bearer ${secret}`);
        operationCalls++;
        if (url.pathname.includes('/foreign/'))
          return Response.json({ code: 'not_found' }, { status: 404 });
        if (url.pathname.endsWith('/download-url')) {
          expect(await request.json()).toEqual({ preview: false });
          return Response.json({ url: new URL('/object', url).href });
        }
        expect(url.pathname).toBe(`/v1/projects/${project}/forms/contact/submissions`);
        return Response.json({ entries: [{ id: 'synthetic' }] });
      },
    });
    const env = { BACKBRICKS_SECRET_KEY: secret };
    const selectors = ['--base-url', server.url.origin, '--project', project, '--json'];
    try {
      const list = await cli(
        cwd,
        [...selectors, 'admin', 'run', 'forms.submissions.list', '--params', '{"key":"contact"}'],
        env,
      );
      expect(list.status).toBe(0);
      expect(JSON.parse(list.stdout)).toEqual({ data: { entries: [{ id: 'synthetic' }] } });
      const foreign = await cli(
        cwd,
        [
          ...selectors,
          'admin',
          'run',
          'forms.submissions.read',
          '--params',
          '{"key":"foreign","id":"synthetic"}',
        ],
        env,
      );
      expect(foreign.status).toBe(3);
      expect(JSON.parse(foreign.stdout)).toMatchObject({ code: 'not_found', status: 404 });
      const download = [
        ...selectors,
        'admin',
        'run',
        'uploads.files.download',
        '--params',
        '{"id":"sample"}',
      ];
      const without = await cli(cwd, download, env);
      expect(JSON.parse(without.stdout)).toMatchObject({ code: 'missing_output' });
      const path = join(cwd, 'download.pdf');
      const saved = await cli(cwd, [...download, '--out', path], env);
      expect(saved.status).toBe(0);
      expect(saved.stdout).not.toContain(bytes);
      expect(await readFile(path, 'utf8')).toBe(bytes);
      expect((await stat(path)).mode & 0o777).toBe(0o600);
      expect((await cli(cwd, [...download, '--out', path], env)).status).toBe(5);
      expect(operationCalls).toBe(3);
    } finally {
      await server.stop(true);
    }
  });
});

test('deployment configuration selects optional services and protects existing credentials', async () => {
  await directory(async (cwd) => {
    const args = [
      'deploy',
      'configure',
      '--modules',
      'forms,uploads',
      '--scan',
      '--backup',
      '--public-url',
      'https://demo.example.invalid',
      '--out',
      cwd,
      '--json',
    ];
    const result = await cli(cwd, args);
    expect(result.status).toBe(0);
    const env = await readFile(join(cwd, '.env'), 'utf8');
    expect(env).toContain('COMPOSE_PROFILES=tls,storage,scan');
    expect(env).toContain('UPLOAD_MODE=proxy');
    expect(env).toContain('SCANNER=clamav');
    for (const name of ['.env', 'garage.toml', 'restic-password'])
      // oxlint-disable-next-line no-await-in-loop -- Verify each independent secret file.
      expect((await stat(join(cwd, name))).mode & 0o777).toBe(0o600);
    expect(result.stdout).not.toContain(env.match(/APP_SECRET=(.+)/)?.[1] ?? 'unexpected');
    expect((await cli(cwd, args)).status).toBe(5);
    expect(await readFile(join(cwd, '.env'), 'utf8')).toBe(env);
  });
});

test('dashboard session commands select organization and preserve server authorization', async () => {
  await directory(async (cwd) => {
    const cookie = 'better-auth.session_token=fixture.session';
    const requests: string[] = [];
    let active = true;
    const server = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      async fetch(request) {
        const url = new URL(request.url);
        requests.push(url.pathname);
        expect(request.headers.get('origin')).toBe(server.url.origin);
        expect(request.headers.get('x-backbricks-csrf')).toBe('1');
        if (url.pathname.endsWith('/sign-in/email'))
          return Response.json({}, { headers: { 'set-cookie': `${cookie}; HttpOnly; Path=/` } });
        expect(request.headers.get('cookie')).toBe(cookie);
        expect(request.headers.has('authorization')).toBe(false);
        if (url.pathname.endsWith('/sign-out')) return Response.json({ success: true });
        if (!active) return Response.json({ code: 'unauthorized' }, { status: 401 });
        if (url.pathname.endsWith('/set-active'))
          expect(await request.json()).toEqual({ organizationId: 'selected' });
        else expect(url.searchParams.get('organizationId')).toBe('selected');
        return Response.json({ ok: true });
      },
    });
    try {
      const file = fileURLToPath(new URL('./session.ts', import.meta.url));
      const signIn = Bun.spawn(
        [
          'bun',
          '-e',
          `import {signIn} from ${JSON.stringify(file)}; await signIn(${JSON.stringify(server.url.origin)}, "owner@example.invalid", "fixture-password");`,
        ],
        { cwd, env: { PATH: process.env['PATH'], BACKBRICKS_CONFIG_HOME: join(cwd, 'auth') } },
      );
      expect(await signIn.exited).toBe(0);
      const options = ['--base-url', server.url.origin, '--json'];
      const flags = ['--session', '--organization', 'selected'];
      expect(
        (await cli(cwd, [...options, '--yes', 'admin', 'run', 'organization.select', ...flags]))
          .status,
      ).toBe(0);
      expect(
        (await cli(cwd, [...options, 'admin', 'run', 'membership.list', ...flags])).status,
      ).toBe(0);
      active = false;
      const expired = await cli(cwd, [...options, 'admin', 'run', 'membership.list', ...flags]);
      expect(JSON.parse(expired.stdout)).toMatchObject({ status: 401, code: 'unauthorized' });
      expect((await cli(cwd, [...options, 'session', 'logout'])).status).toBe(0);
      const missing = await cli(cwd, [...options, 'admin', 'run', 'membership.list', ...flags]);
      expect(JSON.parse(missing.stdout)).toMatchObject({ code: 'missing_session' });
      expect(requests).toEqual([
        '/api/auth/sign-in/email',
        '/api/auth/organization/set-active',
        '/api/auth/organization/list-members',
        '/api/auth/organization/list-members',
        '/api/auth/sign-out',
      ]);
    } finally {
      await server.stop(true);
    }
  });
});

test('raw configuration applies require destructive opt-in and string dry runs stay read-only', async () => {
  await directory(async (cwd) => {
    let called = false;
    const server = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      fetch(request) {
        called = true;
        expect(new URL(request.url).searchParams.get('dryRun')).toBe('true');
        return Response.json({ destructive: false });
      },
    });
    try {
      const flags = ['--base-url', server.url.origin, '--project', project, '--json'];
      const env = { BACKBRICKS_SECRET_KEY: `bb_sk_${'g'.repeat(32)}` };
      const denied = await cli(
        cwd,
        [
          ...flags,
          '--yes',
          'admin',
          'run',
          'forms.instance.replace',
          '--params',
          '{"key":"contact"}',
        ],
        env,
      );
      expect(denied.status).toBe(4);
      expect(called).toBe(false);
      const dryRun = await cli(
        cwd,
        [...flags, 'admin', 'run', 'planProjectConfig', '--query', '{"dryRun":"true"}'],
        env,
      );
      expect(dryRun.status).toBe(0);
      expect(called).toBe(true);
    } finally {
      await server.stop(true);
    }
  });
});

test('every catalog operation dispatches through the CLI with its declared credential kind', async () => {
  await directory(async (cwd) => {
    const cookie = 'better-auth.session_token=catalog.fixture';
    const secret = `bb_sk_${'v'.repeat(32)}`;
    const spec = new Map(
      adminCatalog.map((command) => [
        `${command.method} ${command.path.replaceAll(/\{([^}]+)\}/g, (_slot, name) =>
          name === 'projectId' ? project : 'fixture',
        )}`,
        command,
      ]),
    );
    const seen = new Set<string>();
    const server = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      fetch(request) {
        const url = new URL(request.url);
        if (url.pathname === '/private-download') return new Response('fixture bytes');
        const operation = spec.get(`${request.method} ${url.pathname}`);
        expect(operation).toBeDefined();
        if (!operation) return new Response(null, { status: 404 });
        seen.add(operation.id);
        expect(request.headers.get('cookie')).toBe(operation.role ? cookie : null);
        expect(request.headers.get('authorization')).toBe(
          operation.role ? null : `Bearer ${secret}`,
        );
        return operation.id === 'uploads.files.download'
          ? Response.json({ url: new URL('/private-download', url).href })
          : Response.json({ success: true });
      },
    });
    try {
      const sessions = join(cwd, 'auth', 'sessions');
      await mkdir(sessions, { recursive: true, mode: 0o700 });
      const sessionName = createHash('sha256').update(server.url.origin).digest('hex');
      await writeFile(join(sessions, sessionName), cookie, { mode: 0o600 });
      const common = ['--base-url', server.url.origin, '--project', project, '--json', '--yes'];
      for (let index = 0; index < adminCatalog.length; index += 6) {
        // oxlint-disable-next-line no-await-in-loop -- Bound subprocess concurrency in the acceptance harness.
        await Promise.all(
          adminCatalog.slice(index, index + 6).map(async (operation) => {
            const params = Object.fromEntries(
              [...operation.path.matchAll(/\{([^}]+)\}/g)].map((match) => [
                match[1],
                match[1] === 'projectId' ? project : 'fixture',
              ]),
            );
            const result = await cli(
              cwd,
              [
                ...common,
                'admin',
                'run',
                operation.id,
                '--params',
                JSON.stringify(params),
                '--out',
                join(cwd, `${operation.id}.out`),
                '--allow-destructive',
                ...(operation.role ? ['--session'] : []),
              ],
              { BACKBRICKS_SECRET_KEY: secret },
            );
            expect(result.status, operation.id).toBe(0);
          }),
        );
      }
      expect(seen.size).toBe(adminCatalog.length);
    } finally {
      await server.stop(true);
    }
  });
}, 40_000);
