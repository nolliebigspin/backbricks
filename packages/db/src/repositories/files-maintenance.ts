import { FILE_INSPECTION_STATES, type RepositoryPage } from '@backbricks/core';
import { and, eq, isNotNull, isNull, lte, lt, or, inArray, sql, type SQL } from 'drizzle-orm';

import type { DbTransaction } from '../client.ts';
import { files } from '../schema/files.ts';
import { fileBatchLimit, filesWhere, visibleFiles } from './files-values.ts';
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
      return batch(
        and(
          or(isNotNull(t.deletedAt), inArray(t.status, ['quarantined', 'rejected'])),
          lte(t.cleanupAfter, now),
        ),
        limit,
      );
    },
    async findStaging(now: Date, limit: number) {
      return batch(
        and(
          isNull(t.deletedAt),
          isNotNull(t.copiedAt),
          or(isNull(t.stagingCleanedAt), lt(t.stagingCleanedAt, t.uploadExpiresAt)),
          or(isNull(t.cleanupAfter), lte(t.cleanupAfter, now)),
          lte(t.uploadExpiresAt, now),
        ),
        limit,
      );
    },
    async findRecovery(now: Date, staleBefore: Date, limit: number, maxAttempts: number) {
      return batch(
        and(
          visibleFiles(now),
          inArray(t.status, FILE_INSPECTION_STATES),
          lt(t.scanAttempts, maxAttempts),
          lte(t.updatedAt, staleBefore),
        ),
        limit,
      );
    },
    async hasPendingDeletion() {
      const rows = await tx
        .select({ id: t.id })
        .from(t)
        .where(filesWhere(scope, isNotNull(t.deletedAt), isNotNull(t.cleanupAfter)))
        .limit(1);
      return rows.length > 0;
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
        .where(filesWhere(scope, eq(t.instanceId, instanceId), isNull(t.deletedAt)));
      return rows.rowCount ?? 0;
    },
  };
}
