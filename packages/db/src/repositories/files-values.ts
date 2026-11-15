import { MAX_MAINTENANCE_BATCH } from '@backbricks/core';
import { and, gt, isNull, or, type SQL } from 'drizzle-orm';

import { files } from '../schema/files.ts';
import type { RepositoryScope } from './scope.ts';

export type FileRow = typeof files.$inferSelect;
export type FileInsert = Omit<
  typeof files.$inferInsert,
  'organizationId' | 'projectId' | 'moduleType' | 'uploadTokenHash' | 'sha256'
> & { uploadTokenHash: Uint8Array; sha256?: Uint8Array | null };
export type FileChanges = Partial<
  Pick<
    FileRow,
    | 'status'
    | 'detectedMime'
    | 'scan'
    | 'scanAttempts'
    | 'uploadedAt'
    | 'copiedAt'
    | 'stagingCleanedAt'
    | 'ownerType'
    | 'ownerId'
    | 'subjectEmail'
    | 'expiresAt'
    | 'deletedAt'
    | 'cleanupAfter'
    | 'cleanupAttempts'
  >
> & { updatedAt: Date; sha256?: Uint8Array | null };
export type FileFilters = {
  instanceId?: string;
  status?: FileRow['status'];
  from?: Date;
  to?: Date;
  query?: string;
};
export type FileOwner = { type: string; id: string };
export type FileReadOptions = { lock?: boolean; includeInactive?: boolean };

/** Every file operation requires a project, even if the surrounding tenant frame is organization-only. */
export function filesWhere(scope: RepositoryScope, ...conditions: (SQL | undefined)[]) {
  scope.project();
  return and(scope.where(files), ...conditions);
}
export function visibleFiles(now: Date) {
  return and(isNull(files.deletedAt), or(isNull(files.expiresAt), gt(files.expiresAt, now)));
}
export function fileBatchLimit(limit: number) {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_MAINTENANCE_BATCH)
    throw new Error(`File batches require 1–${MAX_MAINTENANCE_BATCH} records.`);
  return limit;
}

/** bytea is a driver concern; modules use the provider-neutral Uint8Array contract. */
export function fileDbChanges(changes: FileChanges) {
  return {
    ...changes,
    sha256:
      changes.sha256 === null || changes.sha256 === undefined
        ? changes.sha256
        : Buffer.from(changes.sha256),
  };
}
