import { expect, test } from 'bun:test';

import { AppError } from '../errors/app-error.ts';
import { createRateLimiter } from './rate-limiter.ts';

test('rejects raw personal identities before storage and sanitizes provider failures', async () => {
  let calls = 0;
  const limiter = createRateLimiter(
    {
      increment: async () => {
        calls++;
        throw new Error('private database diagnostic');
      },
    },
    { now: () => new Date('2026-11-06T12:00:00Z') },
  );
  const input = { namespace: 'auth.login', identity: '192.0.2.1', limit: 3, windowMs: 1000 };
  const invalid = await limiter.consume(input).catch((error: unknown) => error);
  expect(invalid).toBeInstanceOf(AppError);
  expect(calls).toBe(0);
  expect(JSON.stringify(invalid)).not.toContain(input.identity);
  const failure = await limiter
    .consume({ ...input, identity: 'a'.repeat(64) })
    .catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(AppError);
  expect(calls).toBe(1);
  expect(JSON.stringify(failure)).not.toContain('private database diagnostic');
});
