import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

test('the auth schema regenerates byte-for-byte without a database or env files', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const path = fileURLToPath(
    new URL('../../packages/db/src/schema/auth.generated.ts', import.meta.url),
  );
  const before = readFileSync(path, 'utf8');
  const run = Bun.spawn([process.execPath, '--no-env-file', 'scripts/auth/generate.ts'], {
    cwd: root,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      DATABASE_URL: 'postgres://unreachable.invalid/generation-must-not-connect',
    },
  });
  const [status, stdout, stderr] = await Promise.all([
    run.exited,
    new Response(run.stdout).text(),
    new Response(run.stderr).text(),
  ]);
  expect({ status, diagnostic: status === 0 ? '' : stdout + stderr }).toEqual({
    status: 0,
    diagnostic: '',
  });
  expect(readFileSync(path, 'utf8')).toBe(before);
});
