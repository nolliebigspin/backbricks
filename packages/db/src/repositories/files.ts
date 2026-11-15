import { AppError, MAX_BULK_ITEMS, type RepositoryPage } from '@backbricks/core';
import { and, desc, eq, gte, inArray, isNotNull, isNull, lte, sql } from 'drizzle-orm';

import type { DbTransaction } from '../client.ts';
import { files } from '../schema/files.ts';
import { moduleInstances } from '../schema/instances.ts';
import { fileMaintenance } from './files-maintenance.ts';
import {
  filesWhere,
  fileDbChanges,
  visibleFiles,
  type FileChanges,
  type FileFilters,
  type FileInsert,
  type FileOwner,
  type FileReadOptions,
  type FileRow,
} from './files-values.ts';
import { beforeCursor, type RepositoryScope } from './scope.ts';

/** Thin scoped file persistence; domain transitions, tokens and object I/O remain in uploads. */
export function createUploadsRepository(tx: DbTransaction, scope: RepositoryScope) {
  const t = files;
  return {
    async insert(input: FileInsert) {
      const [row] = await tx
        .insert(t)
        .values({
          ...input,
          uploadTokenHash: Buffer.from(input.uploadTokenHash),
          sha256:
            input.sha256 === null || input.sha256 === undefined
              ? input.sha256
              : Buffer.from(input.sha256),
          ...scope.project(),
        })
        .returning();
      if (!row) throw new Error('File insert returned no row.');
      return row;
    },
    async get(id: string, now: Date, options: FileReadOptions = {}) {
      const query = tx
        .select()
        .from(t)
        .where(
          filesWhere(scope, eq(t.id, id), options.includeInactive ? undefined : visibleFiles(now)),
        );
      const [row] = await (options.lock ? query.for('update') : query);
      if (!row) throw new AppError('not_found');
      return row;
    },
    async resolveZoneKey(id: string, now: Date) {
      const [row] = await tx
        .select({ key: moduleInstances.key })
        .from(t)
        .innerJoin(
          moduleInstances,
          and(
            eq(t.instanceId, moduleInstances.id),
            eq(t.organizationId, moduleInstances.organizationId),
            eq(t.projectId, moduleInstances.projectId),
            eq(moduleInstances.moduleType, 'uploads'),
          ),
        )
        .where(filesWhere(scope, eq(t.id, id), visibleFiles(now)));
      if (!row) throw new AppError('not_found');
      return row.key;
    },
    async list(filters: FileFilters, page: RepositoryPage, now: Date) {
      const query = filters.query
        ?.replaceAll('!', '!!')
        .replaceAll('%', '!%')
        .replaceAll('_', '!_');
      return tx
        .select()
        .from(t)
        .where(
          filesWhere(
            scope,
            visibleFiles(now),
            filters.instanceId ? eq(t.instanceId, filters.instanceId) : undefined,
            filters.status ? eq(t.status, filters.status) : undefined,
            filters.from ? gte(t.createdAt, filters.from) : undefined,
            filters.to ? lte(t.createdAt, filters.to) : undefined,
            query ? sql`${t.originalName} ilike ${`%${query}%`} escape '!'` : undefined,
            beforeCursor(t, page),
          ),
        )
        .orderBy(desc(t.createdAt), desc(t.id))
        .limit(scope.limit(page));
    },
    async lockMany(ids: readonly string[], now: Date, options: FileReadOptions = {}) {
      if (ids.length < 1 || ids.length > MAX_BULK_ITEMS || new Set(ids).size !== ids.length)
        throw new AppError('validation_failed');
      const rows = await tx
        .select()
        .from(t)
        .where(
          filesWhere(
            scope,
            inArray(t.id, [...ids]),
            options.includeInactive ? undefined : visibleFiles(now),
          ),
        )
        .orderBy(t.id)
        .for('update');
      if (rows.length !== ids.length) throw new AppError('not_found');
      return rows;
    },
    async patch(id: string, changes: FileChanges) {
      const [row] = await tx
        .update(t)
        .set(fileDbChanges(changes))
        .where(filesWhere(scope, eq(t.id, id)))
        .returning();
      if (!row) throw new AppError('not_found');
      return row;
    },
    async transition(id: string, from: readonly FileRow['status'][], changes: FileChanges) {
      if (from.length === 0) throw new AppError('internal_error');
      const [row] = await tx
        .update(t)
        .set(fileDbChanges(changes))
        .where(filesWhere(scope, eq(t.id, id), inArray(t.status, [...from]), isNull(t.deletedAt)))
        .returning();
      return row ?? null;
    },
    async byOwner(owner: FileOwner, now: Date, options: FileReadOptions = {}) {
      return tx
        .select()
        .from(t)
        .where(
          filesWhere(
            scope,
            eq(t.ownerType, owner.type),
            eq(t.ownerId, owner.id),
            options.includeInactive ? undefined : visibleFiles(now),
          ),
        )
        .orderBy(t.id);
    },
    async usage() {
      const [row] = await tx
        .select({
          count: sql<string>`count(*)::text`,
          stored: sql<string>`coalesce(sum(case when ${t.status} = 'ready' and ${t.deletedAt} is null then ${t.sizeBytes} else 0 end), 0)::text`,
          reserved: sql<string>`coalesce(sum(${t.sizeBytes} * case when ${t.copiedAt} is not null and ${t.stagingCleanedAt} is null then 2 else 1 end), 0)::text`,
        })
        .from(t)
        .where(filesWhere(scope));
      return {
        count: BigInt(row?.count ?? '0'),
        storedBytes: BigInt(row?.stored ?? '0'),
        reservedBytes: BigInt(row?.reserved ?? '0'),
      };
    },
    async removeDeleted(id: string, now: Date) {
      const removed = await tx
        .delete(t)
        .where(
          filesWhere(
            scope,
            eq(t.id, id),
            isNotNull(t.deletedAt),
            lte(t.cleanupAfter, now),
            lte(t.uploadExpiresAt, now),
            gte(t.stagingCleanedAt, t.uploadExpiresAt),
          ),
        )
        .returning({ id: t.id });
      return removed.length === 1;
    },
    ...fileMaintenance(tx, scope),
  };
}
