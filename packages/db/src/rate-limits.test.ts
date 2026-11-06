import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { createIpIdentity, createRateLimiter, MAX_RATE_LIMIT_COUNT } from '@backbricks/core';

import { createTestDatabase, postgresAvailable } from '../test/test-database.ts';
import { createDatabase } from './client.ts';
import { runMigrations } from './migrate.ts';
import { createPostgresRateLimitStore } from './repositories/rate-limits.ts';
import { rateLimitBuckets } from './schema/technical.ts';

const available = await postgresAvailable();
describe.skipIf(!available)('global rate limiter (real Postgres)', () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let handle: ReturnType<typeof createDatabase>;
  let other: ReturnType<typeof createDatabase>;
  beforeAll(async () => {
    database = await createTestDatabase();
    await runMigrations(database.url);
    handle = createDatabase(database.url);
    other = createDatabase(database.url);
  });
  afterAll(async () => {
    await Promise.all([handle.close(), other.close()]);
    await database.drop();
  });

  test('limits concurrent attempts across pools, rotates windows and stores only hashes', async () => {
    let now = new Date('2026-11-06T12:00:00Z');
    const clock = { now: () => now };
    const limiters = [handle, other].map(({ db }) =>
      createRateLimiter(createPostgresRateLimitStore(db), clock),
    );
    const identity = createIpIdentity({ appSecret: 'fixture-secret', clock, trustedProxies: [] })(
      '192.0.2.1',
      new Headers(),
    );
    const input = { namespace: 'auth.login', identity, limit: 12, windowMs: 10_000 };
    const results = await Promise.all(
      Array.from({ length: 80 }, (_, index) => limiters[index % 2]!.consume(input)),
    );
    expect(results.filter((result) => result.allowed)).toHaveLength(12);
    expect(
      results
        .filter((result) => !result.allowed)
        .every((result) => result.retryAfterSeconds === 10),
    ).toBe(true);
    expect((await limiters[0]!.consume({ ...input, namespace: 'public.write' })).allowed).toBe(
      true,
    );
    expect((await limiters[0]!.consume({ ...input, identity: 'b'.repeat(64) })).allowed).toBe(true);
    now = new Date('2026-11-06T12:00:09.999Z');
    expect((await limiters[0]!.consume(input)).retryAfterSeconds).toBe(1);
    now = new Date('2026-11-06T12:00:10Z');
    expect(await limiters[1]!.consume(input)).toMatchObject({
      allowed: true,
      remaining: 11,
      retryAfterSeconds: 0,
    });
    const rows = await handle.db.select().from(rateLimitBuckets);
    expect(JSON.stringify(rows)).not.toContain('192.0.2.1');
    expect(rows.every((row) => row.expiresAt.getTime() > row.windowStart.getTime())).toBe(true);
  });

  test('saturates counters instead of overflowing and allowing traffic after a database error', async () => {
    const store = createPostgresRateLimitStore(handle.db);
    const bucket = {
      bucket: 'auth.login:fixture-saturation',
      windowStart: new Date('2026-11-06T12:00:00Z'),
      expiresAt: new Date('2026-11-06T12:00:10Z'),
    };
    await handle.db.insert(rateLimitBuckets).values({ ...bucket, count: MAX_RATE_LIMIT_COUNT });
    expect(await store.increment(bucket)).toBe(MAX_RATE_LIMIT_COUNT);
  });
});
