import { AppError, MAX_MAINTENANCE_BATCH } from '@backbricks/core';
import { and, lte, sql, type SQL } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';

import type { DbTransaction } from '../client.ts';

/** Owned tables/columns only; ctid identifies the locked batch without copying any personal values. */
export async function purgeExpiredRows(
  tx: DbTransaction,
  table: PgTable,
  expiry: PgColumn,
  now: Date,
  limit: number,
  scope?: SQL,
) {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_MAINTENANCE_BATCH)
    throw new AppError('invalid_request');
  const result = await tx.execute(sql`delete from ${table}
    where ${scope ?? sql`true`} and ctid in (
      select ctid from ${table} where ${and(scope, lte(expiry, now))}
      order by ${expiry}, ctid limit ${limit} for update skip locked
    ) returning 1`);
  if (Array.isArray(result)) throw new AppError('internal_error');
  return result.rowCount ?? 0;
}
