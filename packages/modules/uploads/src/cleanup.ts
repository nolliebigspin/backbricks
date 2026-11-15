import { AppError } from '@backbricks/core';

import { UPLOAD_JOBS, UPLOAD_RETRIES } from './constants.ts';
import type { UploadRecord } from './repository.ts';
import { uploadsRepository, type UploadsRuntime } from './runtime.ts';

/** Runs only after durable state commits. Both keys remain tracked until outstanding PUTs settle. */
export async function cleanupUpload(
  runtime: UploadsRuntime,
  input: { fileId: string },
): Promise<void> {
  const repository = uploadsRepository(runtime);
  const now = runtime.services.clock.now();
  await repository.lockProject();
  let file: UploadRecord;
  try {
    file = await repository.get(input.fileId, now, { lock: true, includeInactive: true });
  } catch (error) {
    if (error instanceof AppError && error.code === 'not_found') return;
    throw error;
  }
  const terminal = file.deletedAt || ['quarantined', 'rejected'].includes(file.status);
  if (!terminal && file.status !== 'ready') return;
  const queue = runtime.services.optional('queue');
  if (!queue) throw new AppError('service_unavailable');
  const storage = runtime.services.require('storage');
  let stagingStartedAt: Date;
  try {
    if (terminal) await storage.delete(file.storageKey);
    // A response after expiry cannot prove the DELETE began after the last allowed PUT.
    stagingStartedAt = runtime.services.clock.now();
    await storage.delete(file.stagingKey);
  } catch (error) {
    if (!(error instanceof AppError) || error.code !== 'service_unavailable') throw error;
    const failedAt = runtime.services.clock.now();
    const cleanupAfter = new Date(failedAt.getTime() + UPLOAD_RETRIES.cleanupDelayMs);
    await repository.patch(file.id, {
      cleanupAttempts: file.cleanupAttempts + 1,
      cleanupAfter,
      updatedAt: failedAt,
    });
    await queue.enqueue(
      runtime.tx,
      UPLOAD_JOBS.cleanup,
      { fileId: file.id },
      { notBefore: cleanupAfter },
    );
    return;
  }
  const completedAt = runtime.services.clock.now();
  const pendingPut = stagingStartedAt < file.uploadExpiresAt;
  const cleanupAfter = pendingPut
    ? new Date(Math.max(file.uploadExpiresAt.getTime(), completedAt.getTime() + 1000))
    : file.deletedAt
      ? completedAt
      : null;
  await repository.patch(file.id, {
    stagingCleanedAt: stagingStartedAt,
    ...(terminal ? { storageCleanedAt: completedAt } : {}),
    cleanupAttempts: file.cleanupAttempts + 1,
    cleanupAfter,
    updatedAt: completedAt,
  });
  if (pendingPut && cleanupAfter)
    await queue.enqueue(
      runtime.tx,
      UPLOAD_JOBS.cleanup,
      { fileId: file.id },
      { notBefore: cleanupAfter },
    );
  else if (file.deletedAt) await repository.removeDeleted(file.id, completedAt);
}
