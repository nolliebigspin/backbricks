import { z } from 'zod';

import { AppError } from '../errors/app-error.ts';
import type { Clock } from '../time/clock.ts';
import { MILLISECONDS_PER_DAY } from '../time/retention.ts';

export const MAX_RATE_LIMIT_COUNT = 2_147_483_647;
export const rateLimitInputSchema = z
  .object({
    namespace: z.string().regex(/^(auth|public|management)\.[a-z][a-z0-9_.-]{0,63}$/),
    identity: z.string().regex(/^[a-f0-9]{64}$/),
    limit: z.number().int().min(1).max(1_000_000),
    windowMs: z.number().int().min(1000).max(MILLISECONDS_PER_DAY),
  })
  .strict();
export type RateLimitInput = z.infer<typeof rateLimitInputSchema>;
export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfterSeconds: number;
};
export type RateLimitBucket = { bucket: string; windowStart: Date; expiresAt: Date };

/** Global technical storage. Implementations must increment atomically, saturating at MAX_RATE_LIMIT_COUNT. */
export interface RateLimitStore {
  increment(bucket: RateLimitBucket): Promise<number>;
}
export interface RateLimiter {
  consume(input: RateLimitInput): Promise<RateLimitResult>;
}

/** Shared fixed-window semantics for Postgres and memory stores; provider failure fails closed. */
export function createRateLimiter(store: RateLimitStore, clock: Clock): RateLimiter {
  return {
    async consume(input) {
      const parsed = rateLimitInputSchema.safeParse(input);
      if (!parsed.success) throw new AppError('internal_error');
      const { namespace, identity, windowMs, limit } = parsed.data;
      const now = clock.now().getTime();
      const start = Math.floor(now / windowMs) * windowMs;
      const resetAt = new Date(start + windowMs);
      let count: number;
      try {
        count = await store.increment({
          bucket: `${namespace}:${identity}:${windowMs}:${start}`,
          windowStart: new Date(start),
          expiresAt: resetAt,
        });
        if (!Number.isSafeInteger(count) || count < 1) throw new Error();
      } catch {
        throw new AppError('service_unavailable', { detail: 'Rate limiting is unavailable.' });
      }
      const allowed = count <= limit;
      return {
        allowed,
        remaining: Math.max(0, limit - count),
        resetAt,
        retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((resetAt.getTime() - now) / 1000)),
      };
    },
  };
}
