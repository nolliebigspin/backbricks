/**
 * Starts the real entry point per role (spawned processes). Needs the compose Postgres
 * (`mise run infra`); locally skipped without it, in CI it fails.
 */
import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

import { createDatabase } from '@backbricks/db';

const main = join(import.meta.dir, 'main.ts');
const databaseUrl =
  process.env['TEST_DATABASE_URL'] ?? 'postgres://backbricks:backbricks@localhost:5432/backbricks';

async function postgresUp(): Promise<boolean> {
  const database = createDatabase(databaseUrl);
  try {
    await database.ping();
    return true;
  } catch {
    return false;
  } finally {
    await database.close();
  }
}

const available = await postgresUp();
if (!available && process.env['CI']) throw new Error('Postgres is not running (mise run infra)');

function spawnRole(role: string, env: Record<string, string> = {}) {
  return Bun.spawn(['bun', '--no-env-file', main, role], {
    cwd: import.meta.dir,
    env: {
      PATH: process.env['PATH'] ?? '',
      NODE_ENV: 'test',
      DATABASE_URL: databaseUrl,
      APP_SECRET: 'test-secret-test-secret-test-secret-00',
      LOG_LEVEL: 'info',
      BACKBRICKS_MODULES: 'forms',
      ...env,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
}

/** Reads stdout until every message appears (pino JSON lines), or fails after the timeout. */
async function waitForLogs(
  proc: ReturnType<typeof spawnRole>,
  messages: string[],
  timeoutMs = 10_000,
) {
  const reader = proc.stdout.getReader();
  const decoder = new TextDecoder();
  let output = '';
  const deadline = Date.now() + timeoutMs;
  while (!messages.every((message) => output.includes(`"msg":"${message}"`))) {
    if (Date.now() > deadline)
      throw new Error(`timed out waiting for ${messages.join(', ')}:\n${output}`);
    // oxlint-disable-next-line no-await-in-loop
    const { value, done } = await reader.read();
    if (done) throw new Error(`process ended before ${messages.join(', ')}:\n${output}`);
    output += decoder.decode(value);
  }
  reader.releaseLock();
  return output;
}

describe('entry point', () => {
  test('an unknown role prints the usage and exits with 2', async () => {
    const proc = spawnRole('serv');
    expect(await proc.exited).toBe(2);
    expect(await new Response(proc.stderr).text()).toContain('<serve|worker|all|migrate>');
  });

  test('invalid configuration lists the problems without values and exits with 1', async () => {
    const proc = spawnRole('serve', { DATABASE_URL: 'mysql://root:hunter2@db/app' });
    expect(await proc.exited).toBe(1);
    const stderr = await new Response(proc.stderr).text();
    expect(stderr).toContain('DATABASE_URL: must be a postgres:// URL');
    expect(stderr).not.toContain('hunter2');
  });

  test('uploads without storage variables refuses to start', async () => {
    const proc = spawnRole('serve', { BACKBRICKS_MODULES: 'uploads' });
    expect(await proc.exited).toBe(1);
    expect(await new Response(proc.stderr).text()).toContain('S3_ENDPOINT');
  });
  test('production auth refuses an HTTP public URL', async () => {
    const proc = spawnRole('serve', {
      NODE_ENV: 'production',
      PUBLIC_URL: 'http://localhost:3000',
    });
    expect(await proc.exited).toBe(1);
    expect(await new Response(proc.stdout).text()).toContain(
      'Production authentication requires HTTPS.',
    );
  });
});

describe.skipIf(!available)('process roles (needs mise run infra)', () => {
  test('serve answers /healthz and /readyz and stops cleanly on SIGTERM', async () => {
    const port = String(20_000 + Math.floor(Math.random() * 20_000));
    const proc = spawnRole('serve', { PORT: port });
    await waitForLogs(proc, ['serve ready']);
    expect((await fetch(`http://localhost:${port}/healthz`)).status).toBe(200);
    expect((await fetch(`http://localhost:${port}/readyz`)).status).toBe(200);
    proc.kill('SIGTERM');
    expect(await proc.exited).toBe(0);
  });

  test('worker starts and stops cleanly on SIGTERM', async () => {
    const proc = spawnRole('worker');
    await waitForLogs(proc, ['worker ready']);
    proc.kill('SIGTERM');
    expect(await proc.exited).toBe(0);
  });

  test('all runs serve and worker in one process', async () => {
    const port = String(20_000 + Math.floor(Math.random() * 20_000));
    const proc = spawnRole('all', { PORT: port });
    await waitForLogs(proc, ['serve ready', 'worker ready']);
    expect((await fetch(`http://localhost:${port}/healthz`)).status).toBe(200);
    proc.kill('SIGINT');
    expect(await proc.exited).toBe(0);
  });

  test('migrate applies migrations and exits with 0', async () => {
    const proc = spawnRole('migrate');
    expect(await proc.exited).toBe(0);
    expect(await new Response(proc.stdout).text()).toContain('"msg":"migrations applied"');
  });

  test('migrate exits with 1 when the database is unreachable', async () => {
    const proc = spawnRole('migrate', { DATABASE_URL: 'postgres://u:p@127.0.0.1:1/none' });
    expect(await proc.exited).toBe(1);
  });
});
