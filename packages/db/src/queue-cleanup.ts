import { AppError, MAX_MAINTENANCE_BATCH } from '@backbricks/core';
import { sql } from 'drizzle-orm';

import type { Database } from './client.ts';
import { QUEUE_SCHEMA } from './queue-constants.ts';

/** Absolute vendor keep_until bounds failed/queued payloads as well as completed jobs. */
export function createQueueCleanup(db: Database) {
  return async (now: Date, limit = MAX_MAINTENANCE_BATCH) => {
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_MAINTENANCE_BATCH)
      throw new AppError('invalid_request');
    return db.transaction(async (tx) => {
      const table = sql`${sql.identifier(QUEUE_SCHEMA)}.${sql.identifier('job')}`;
      const result = await tx.execute(sql`delete from ${table} where ctid in (
        select ctid from ${table} where keep_until <= ${now}
        order by keep_until, ctid limit ${limit} for update skip locked
      ) returning 1`);
      if (Array.isArray(result)) throw new AppError('internal_error');
      return result.rowCount ?? 0;
    });
  };
}
