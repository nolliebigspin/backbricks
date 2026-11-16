import { AppError, principalActor } from '@backbricks/core';

import { UPLOAD_JOBS, UPLOAD_AUDIT_ACTIONS } from './constants.ts';
import type { UploadRecord } from './repository.ts';
import { uploadsRepository, type UploadsRuntime } from './runtime.ts';

/** Persist revocation, audit and cleanup together; never perform object deletion before commit. */
export async function requestFileDeletion(
  runtime: UploadsRuntime,
  file: UploadRecord,
): Promise<void> {
  if (file.deletedAt) return;
  const queue = runtime.services.optional('queue');
  if (!queue) throw new AppError('service_unavailable');
  const now = runtime.services.clock.now();
  await uploadsRepository(runtime).patch(file.id, {
    // Personal fields disappear immediately; only opaque operational cleanup identity survives outages.
    originalName: 'deleted',
    metadata: {},
    subjectEmail: null,
    ownerType: null,
    ownerId: null,
    ownerExpiresAt: null,
    sha256: null,
    detectedMime: null,
    scan: null,
    expiresAt: new Date(Math.max(now.getTime(), file.createdAt.getTime() + 1)),
    deletedAt: now,
    cleanupAfter: now,
    updatedAt: now,
  });
  await runtime.services.audit.record(runtime.tx, {
    ...(runtime.tx.context.principal
      ? principalActor(runtime.tx.context.principal)
      : { actorType: 'system' as const, actorId: null }),
    action: UPLOAD_AUDIT_ACTIONS.deleted,
    targetType: 'file',
    targetId: file.id,
    changes: { count: 1 },
  });
  await queue.enqueue(runtime.tx, UPLOAD_JOBS.cleanup, { fileId: file.id });
}
