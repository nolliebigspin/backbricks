import { AppError, type JsonValue } from '@backbricks/core';

import { UPLOAD_EVENTS, UPLOAD_JOBS } from './constants.ts';
import type { UploadChanges, UploadRecord } from './repository.ts';
import { uploadsRepository, type UploadsRuntime } from './runtime.ts';

/** Status, safe event/audit and durable physical-cleanup intent commit atomically. */
export async function finishUpload(
  runtime: UploadsRuntime,
  file: UploadRecord,
  status: keyof typeof UPLOAD_EVENTS,
  scan: JsonValue,
  changes: UploadChanges,
): Promise<void> {
  const queue = runtime.services.optional('queue');
  if (!queue) throw new AppError('service_unavailable');
  const now = runtime.services.clock.now();
  const cleanupAfter = status === 'ready' ? file.uploadExpiresAt : now;
  await uploadsRepository(runtime).patch(file.id, {
    ...changes,
    status,
    scan,
    cleanupAfter,
    updatedAt: now,
  });
  const metadata = {
    instanceId: file.instanceId,
    configVersion: file.configVersion,
    status,
    isTest: file.isTest,
  };
  await runtime.services.events.publish(runtime.tx, {
    type: UPLOAD_EVENTS[status].name,
    subjectType: 'file',
    subjectId: file.id,
    payload: metadata,
  });
  await runtime.services.audit.record(runtime.tx, {
    actorType: 'system',
    action: UPLOAD_EVENTS[status].name,
    targetType: 'file',
    targetId: file.id,
    changes: metadata,
  });
  await queue.enqueue(
    runtime.tx,
    UPLOAD_JOBS.cleanup,
    { fileId: file.id },
    { notBefore: cleanupAfter },
  );
}
