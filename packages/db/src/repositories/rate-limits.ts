import { MAX_RATE_LIMIT_COUNT, type RateLimitStore } from '@backbricks/core';
import { sql } from 'drizzle-orm';

import type { Database } from '../client.ts';
import { rateLimitBuckets } from '../schema/technical.ts';

/** Global, non-tenant abuse buckets. One upsert serializes concurrent attempts across processes. */
export function createPostgresRateLimitStore(db: Database): RateLimitStore {
  return {
    async increment(input) {
      const rows = await db
        .insert(rateLimitBuckets)
        .values({ ...input, count: 1 })
        .onConflictDoUpdate({
          target: rateLimitBuckets.bucket,
          set: {
            count: sql`least(${rateLimitBuckets.count} + 1::bigint, ${MAX_RATE_LIMIT_COUNT})`,
          },
        })
        .returning({ count: rateLimitBuckets.count });
      const row = rows[0];
      if (!row) throw new Error('Rate limit counter unavailable');
      return row.count;
    },
  };
}
