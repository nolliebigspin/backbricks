import { AppError } from '@backbricks/core';

import { UPLOAD_JOBS, UPLOAD_RETRIES } from './constants.ts';
import { requestFileDeletion } from './deletion.ts';
import { uploadsRepository, type UploadsRuntime } from './runtime.ts';

/** Keep the final object identity until physical deletion and all previously issued PUTs have settled. */
export async function eraseUploadScope(runtime: UploadsRuntime, { limit }: { limit: number }) {
  const repository = uploadsRepository(runtime);
  const now = runtime.services.clock.now();
  const queue = runtime.services.optional('queue');
  if (!queue) throw new AppError('service_unavailable');
  const rows = await repository.forScope(limit);
  let count = 0;
  let pendingUntil: Date | undefined;
  for (const file of rows) {
    // oxlint-disable-next-line no-await-in-loop -- Every durable marker shares this project erasure transaction.
    if (!file.deletedAt) await requestFileDeletion(runtime, file);
    // oxlint-disable-next-line no-await-in-loop -- Confirmed removal never precedes the last possible staging write.
    else if (await repository.removeDeleted(file.id, now)) {
      count++;
      continue;
    } else if (!file.cleanupAfter || file.cleanupAfter <= now) {
      // oxlint-disable-next-line no-await-in-loop -- Recover a missing/failed cleanup delivery while preserving its row.
      await queue.enqueue(runtime.tx, UPLOAD_JOBS.cleanup, { fileId: file.id });
    }
    const next =
      file.storageCleanedAt && now < file.uploadExpiresAt
        ? file.uploadExpiresAt
        : new Date(now.getTime() + UPLOAD_RETRIES.cleanupDelayMs);
    if (!pendingUntil || next < pendingUntil) pendingUntil = next;
  }
  return { count, ...(pendingUntil ? { pendingUntil } : {}) };
}
