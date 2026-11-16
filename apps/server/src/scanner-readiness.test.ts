import { expect, test } from 'bun:test';

import { clamavAvailable, clamavTestConfig } from '../../../scripts/test/clamav.ts';
import { available, scenario } from '../test/auth-fixture.ts';
import { uploadsAvailable, uploadsEnvironment } from '../test/uploads-fixture.ts';

const scannerAvailable = await clamavAvailable();
test.skipIf(!uploadsAvailable || !scannerAvailable)(
  'scanner readiness follows configured uploads; scanner none and forms-only need no daemon',
  async () => {
    await scenario(
      async (f) => {
        const response = await fetch(`${f.origin}/readyz`);
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ checks: { scanner: 'ok', storage: 'ok' } });
      },
      {
        ...uploadsEnvironment,
        SCANNER: 'clamav',
        CLAMAV_HOST: clamavTestConfig.host,
        CLAMAV_PORT: String(clamavTestConfig.port),
      },
    );
    await scenario(async (f) => {
      const response = await fetch(`${f.origin}/readyz`);
      expect(response.status).toBe(200);
      const result: unknown = await response.json();
      expect(result).not.toHaveProperty('checks.scanner');
    }, uploadsEnvironment);
    await scenario(
      async (f) => {
        expect((await fetch(`${f.origin}/healthz`)).status).toBe(200);
        expect((await fetch(`${f.origin}/readyz`)).status).toBe(503);
        expect(f.logs.join('')).not.toContain('ECONNREFUSED');
      },
      { ...uploadsEnvironment, SCANNER: 'clamav', CLAMAV_HOST: '127.0.0.1', CLAMAV_PORT: '1' },
    );
  },
  30_000,
);

test.skipIf(!available)(
  'forms-only ignores scanner configuration and registers no scanner readiness check',
  async () => {
    await scenario(
      async (f) => {
        const response = await fetch(`${f.origin}/readyz`);
        expect(response.status).toBe(200);
        expect(await response.json()).not.toHaveProperty('checks.scanner');
      },
      {
        BACKBRICKS_MODULES: 'forms',
        SCANNER: 'clamav',
        CLAMAV_HOST: 'unreachable.invalid',
        CLAMAV_PORT: 'invalid',
      },
    );
  },
);
