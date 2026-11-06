import { expect, test } from 'bun:test';

import { z } from 'zod';

import { jobRegistrar } from './registrars.ts';

test('scheduled jobs must validate an empty wire payload before startup', () => {
  const registrar = jobRegistrar(() => ({}));
  const spec = { name: 'fixture.tick', retries: 1, retentionSeconds: 3600, cron: '0 * * * *' };
  expect(() =>
    registrar.register(spec, z.object({ amount: z.number() }).strict(), async () => {}),
  ).toThrow('Scheduled jobs must accept an empty wire payload.');
  expect(registrar.jobs).toHaveLength(0);
  registrar.register(spec, z.object({ amount: z.number().default(1) }).strict(), async () => {});
  expect(registrar.jobs).toHaveLength(1);
});
