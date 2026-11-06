import { expect, test } from 'bun:test';

import { createMemoryRateLimiter } from './memory-rate-limiter.ts';

test('memory limiter atomically shares counters, isolates namespaces and resets at the boundary', async () => {
  let now = new Date('2026-11-06T12:00:00.000Z');
  const limiter = createMemoryRateLimiter({ now: () => now });
  const input = { namespace: 'auth.login', identity: 'a'.repeat(64), limit: 5, windowMs: 10_000 };
  const attempts = await Promise.all(Array.from({ length: 20 }, () => limiter.consume(input)));
  expect(attempts.filter((result) => result.allowed)).toHaveLength(5);
  expect(attempts.at(-1)).toMatchObject({ remaining: 0, retryAfterSeconds: 10 });
  expect((await limiter.consume({ ...input, namespace: 'public.write' })).allowed).toBe(true);
  now = new Date('2026-11-06T12:00:09.999Z');
  expect((await limiter.consume(input)).retryAfterSeconds).toBe(1);
  now = new Date('2026-11-06T12:00:10.000Z');
  expect(await limiter.consume(input)).toMatchObject({
    allowed: true,
    remaining: 4,
    retryAfterSeconds: 0,
  });
});
