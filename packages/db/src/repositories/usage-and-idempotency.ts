import {
  idempotencyRecordSchema,
  type IdempotencyRepository,
  type UsageRepository,
} from '@backbricks/core';
import { and, asc, eq, gt, lte, sql } from 'drizzle-orm';

import type { DbTransaction } from '../client.ts';
import { usageCounters } from '../schema/platform.ts';
import { idempotencyKeys } from '../schema/technical.ts';
import type { RepositoryScope } from './scope.ts';

export function createUsageRepository(tx: DbTransaction, scope: RepositoryScope): UsageRepository {
  return {
    async increment(metric, period, delta) {
      await tx
        .insert(usageCounters)
        .values({ ...scope.project(), metric, period, value: delta })
        .onConflictDoUpdate({
          target: [
            usageCounters.organizationId,
            usageCounters.projectId,
            usageCounters.metric,
            usageCounters.period,
          ],
          set: { value: sql`${usageCounters.value} + ${delta}` },
        });
    },
    async list(period) {
      scope.project();
      return tx
        .select({ metric: usageCounters.metric, value: usageCounters.value })
        .from(usageCounters)
        .where(and(scope.where(usageCounters), eq(usageCounters.period, period)))
        .orderBy(asc(usageCounters.metric));
    },
  };
}

export function createIdempotencyRepository(
  tx: DbTransaction,
  scope: RepositoryScope,
): IdempotencyRepository {
  return {
    async get(key, now) {
      scope.project();
      const rows = await tx
        .select()
        .from(idempotencyKeys)
        .where(
          and(
            scope.where(idempotencyKeys),
            eq(idempotencyKeys.key, key),
            gt(idempotencyKeys.expiresAt, now),
          ),
        )
        .limit(1);
      return rows[0] ? idempotencyRecordSchema.parse(rows[0]) : null;
    },
    async insert(input) {
      const values = { ...input, ...scope.project(), requestHash: Buffer.from(input.requestHash) };
      const rows = await tx
        .insert(idempotencyKeys)
        .values(values)
        .onConflictDoUpdate({
          target: [idempotencyKeys.organizationId, idempotencyKeys.projectId, idempotencyKeys.key],
          set: values,
          where: lte(idempotencyKeys.expiresAt, input.createdAt),
        })
        .returning({ key: idempotencyKeys.key });
      return rows.length === 1;
    },
  };
}
