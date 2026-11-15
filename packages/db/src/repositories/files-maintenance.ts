import type { RepositoryPage } from '@backbricks/core';
import { and, eq, isNotNull, isNull, lte, sql, type SQL } from 'drizzle-orm';

import type { DbTransaction } from '../client.ts';
import { files } from '../schema/files.ts';
import { fileBatchLimit, filesWhere } from './files-values.ts';
import { beforeCursor, type RepositoryScope } from './scope.ts';

export function fileMaintenance(tx: DbTransaction, scope: RepositoryScope) {
  const t = files;
  const batch = (condition: SQL | undefined, limit: number) =>
    tx
      .select()
      .from(t)
      .where(filesWhere(scope, condition))
      .orderBy(t.createdAt, t.id)
      .limit(fileBatchLimit(limit))
      .for('update', { skipLocked: true });
  return {
    async findExpired(now: Date, limit: number) {
      return batch(and(isNull(t.deletedAt), isNotNull(t.expiresAt), lte(t.expiresAt, now)), limit);
    },
    async findCleanup(now: Date, limit: number) {
      return batch(and(isNotNull(t.deletedAt), lte(t.cleanupAfter, now)), limit);
    },
    async findStaging(now: Date, limit: number) {
      return batch(
        and(
          isNull(t.deletedAt),
          isNotNull(t.copiedAt),
          isNull(t.stagingCleanedAt),
          lte(t.uploadExpiresAt, now),
        ),
        limit,
      );
    },
    async forScope(limit: number) {
      return batch(undefined, limit);
    },
    async findBySubject(email: string, page: RepositoryPage) {
      return tx
        .select()
        .from(t)
        .where(filesWhere(scope, eq(t.subjectEmail, email), beforeCursor(t, page)))
        .orderBy(sql`${t.createdAt} desc`, sql`${t.id} desc`)
        .limit(scope.limit(page));
    },
    async recomputeExpiry(instanceId: string, retentionDays: number | null) {
      const expiry =
        retentionDays === null
          ? sql`null::timestamptz`
          : sql`${t.createdAt} + make_interval(days => ${retentionDays})`;
      const rows = await tx
        .update(t)
        .set({
          expiresAt: sql`case when ${t.ownerId} is null then ${t.expiresAt} else least(${expiry}, ${t.ownerExpiresAt}) end`,
        })
        .where(filesWhere(scope, eq(t.instanceId, instanceId), isNull(t.deletedAt)))
        .returning({ id: t.id });
      return rows.length;
    },
  };
}
