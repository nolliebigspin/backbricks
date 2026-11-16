import { AppError } from '@backbricks/core';

import { UPLOAD_JOBS, UPLOAD_MAINTENANCE, UPLOAD_RETRIES } from './constants.ts';
import { requestFileDeletion } from './deletion.ts';
import { uploadsRepository, type UploadsRuntime } from './runtime.ts';

/** Discovery commits bounded durable work; object deletion never precedes its marker's commit. */
export async function maintainUploads(
  runtime: UploadsRuntime,
  { now, limit }: { now: Date; limit: number },
) {
  const repository = uploadsRepository(runtime);
  const queue = runtime.services.optional('queue');
  if (!queue) throw new AppError('service_unavailable');
  const expired = await repository.findExpired(now, limit);
  let remaining = limit - expired.length;
  let scheduled = 0;
  const seen = new Set(expired.map((file) => file.id));
  for (const file of expired) {
    // oxlint-disable-next-line no-await-in-loop -- Markers, audit and cleanup enqueue share one bounded transaction.
    await requestFileDeletion(runtime, file);
  }
  const bucket = Math.floor(now.getTime() / UPLOAD_MAINTENANCE.recoveryBucketMs);
  for (const read of [
    () => repository.findCleanup(now, remaining),
    () => repository.findStaging(now, remaining),
  ]) {
    if (!remaining) break;
    // oxlint-disable-next-line no-await-in-loop -- Queries consume one shared bounded budget and skip already selected IDs.
    const rows = await read();
    for (const file of rows) {
      if (seen.has(file.id)) continue;
      seen.add(file.id);
      remaining--;
      // Stable hourly identities deduplicate discovery while allowing later retries.
      if (
        // oxlint-disable-next-line no-await-in-loop -- One transaction owns every bounded enqueue.
        await queue.enqueue(
          runtime.tx,
          UPLOAD_JOBS.cleanup,
          { fileId: file.id },
          { singletonKey: `${file.id}:maintenance:${bucket}` },
        )
      )
        scheduled++;
    }
  }
  if (remaining && !runtime.tx.context.archivedMaintenance) {
    const rows = await repository.findRecovery(
      now,
      new Date(now.getTime() - UPLOAD_MAINTENANCE.staleScanMs),
      remaining,
      UPLOAD_RETRIES.scanAttempts,
    );
    for (const file of rows) {
      remaining--;
      // Recover only the current durable attempt, never reset its budget.
      if (
        // oxlint-disable-next-line no-await-in-loop -- One transaction owns every bounded enqueue.
        await queue.enqueue(
          runtime.tx,
          UPLOAD_JOBS.scan,
          { fileId: file.id, attempt: file.scanAttempts },
          { singletonKey: `${file.id}:recovery:${bucket}` },
        )
      )
        scheduled++;
    }
  }
  return {
    count: expired.length,
    more: remaining === 0 && expired.length + scheduled > 0,
    ...(expired.length < limit
      ? { notBefore: new Date(now.getTime() + UPLOAD_RETRIES.cleanupDelayMs) }
      : {}),
  };
}
