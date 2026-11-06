import {
  createRateLimiter,
  MAX_RATE_LIMIT_COUNT,
  type Clock,
  type RateLimiter,
} from '@backbricks/core';

/** Tests and single-process installations only; production composition uses Postgres. */
export function createMemoryRateLimiter(clock: Clock): RateLimiter {
  const buckets = new Map<string, { count: number; expiresAt: number }>();
  return createRateLimiter(
    {
      async increment(input) {
        const now = clock.now().getTime();
        for (const [key, entry] of buckets) {
          if (entry.expiresAt <= now) buckets.delete(key);
        }
        const count = Math.min(MAX_RATE_LIMIT_COUNT, (buckets.get(input.bucket)?.count ?? 0) + 1);
        buckets.set(input.bucket, { count, expiresAt: input.expiresAt.getTime() });
        return count;
      },
    },
    clock,
  );
}
