import {
  AppError,
  createSubjectCollection,
  MAX_PAGE_SIZE,
  pageResult,
  repositoryPage,
  subjectAttachmentSchema,
  type SubjectAttachmentSource,
} from '@backbricks/core';

import { fileDetailSchema } from './admin-schemas.ts';
import { UPLOAD_RETRIES } from './constants.ts';
import { requestFileDeletion } from './deletion.ts';
import { attachmentMetadata, fileManagementMetadata } from './metadata.ts';
import type { UploadRecord } from './repository.ts';
import { uploadsRepository, type UploadsRuntime } from './runtime.ts';
import { isUsableFile } from './usability.ts';

function availability(file: UploadRecord, now: Date) {
  return file.deletedAt
    ? 'deleted'
    : file.expiresAt && file.expiresAt <= now
      ? 'expired'
      : isUsableFile(file, now)
        ? 'ready'
        : 'not_ready';
}
/** Complete private metadata only; never export tokens, signatures, object keys or content hashes. */
export async function exportUploadSubject(runtime: UploadsRuntime, email: string) {
  const collection = createSubjectCollection();
  let cursor: string | undefined;
  do {
    const page = pageResult(
      // oxlint-disable-next-line no-await-in-loop -- Ordered pages and operations share scoped frames; parallel work would break their sequence.
      await uploadsRepository(runtime).findBySubject(
        email,
        repositoryPage({ limit: MAX_PAGE_SIZE, cursor }),
      ),
      MAX_PAGE_SIZE,
    );
    for (const file of page.data)
      collection.add(
        fileDetailSchema.parse({
          ...fileManagementMetadata(file, runtime.services.clock.now()),
          metadata: file.metadata,
        }),
      );
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return { files: collection.values };
}
export async function deleteUploadSubject(runtime: UploadsRuntime, email: string) {
  const repository = uploadsRepository(runtime);
  let count = 0;
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- Ordered pages and operations share scoped frames; parallel work would break their sequence.
    const rows = await repository.findBySubject(email, { limit: MAX_PAGE_SIZE });
    // oxlint-disable-next-line no-await-in-loop -- Ordered pages and operations share scoped frames; parallel work would break their sequence.
    for (const row of rows) await requestFileDeletion(runtime, row);
    count += rows.length;
    if (rows.length < MAX_PAGE_SIZE) return count;
  }
}
/** A continuation carries no subject identity and conservatively waits for all project cleanup. */
export async function pendingUploadErasure(runtime: UploadsRuntime) {
  return (await uploadsRepository(runtime).hasPendingDeletion())
    ? new Date(runtime.services.clock.now().getTime() + UPLOAD_RETRIES.cleanupDelayMs)
    : null;
}
export const uploadSubjectAttachments = {
  async list(runtime: UploadsRuntime, email: string, cursor?: string) {
    const page = pageResult(
      await uploadsRepository(runtime).findBySubject(
        email,
        repositoryPage({ limit: MAX_PAGE_SIZE, cursor }),
      ),
      MAX_PAGE_SIZE,
    );
    const now = runtime.services.clock.now();
    return {
      ...page,
      data: page.data.map((file) =>
        subjectAttachmentSchema.parse({
          ...attachmentMetadata(file, now),
          availability: availability(file, now),
        }),
      ),
    };
  },
  async open(runtime: UploadsRuntime, email: string, id: string): Promise<SubjectAttachmentSource> {
    try {
      const now = runtime.services.clock.now();
      const file = await uploadsRepository(runtime).get(id, now, { includeInactive: true });
      if (file.subjectEmail !== email) return { status: 'unavailable', reason: 'deleted' };
      const state = availability(file, now);
      if (state !== 'ready') return { status: 'unavailable', reason: state };
      const storage = runtime.services.require('storage');
      const head = await storage.head(file.storageKey);
      if (!head) return { status: 'unavailable', reason: 'missing' };
      if (head.size !== file.sizeBytes) return { status: 'unavailable', reason: 'unavailable' };
      // Recheck the scoped record and clock after provider I/O, before opening private bytes.
      const current = await uploadsRepository(runtime).get(id, now, { includeInactive: true });
      if (current.subjectEmail !== email) return { status: 'unavailable', reason: 'deleted' };
      const currentState = availability(current, runtime.services.clock.now());
      if (currentState !== 'ready') return { status: 'unavailable', reason: currentState };
      return { status: 'available', stream: await storage.read(current.storageKey) };
    } catch (error) {
      if (error instanceof AppError && error.code === 'not_found')
        return { status: 'unavailable', reason: 'deleted' };
      if (error instanceof AppError && error.code === 'service_unavailable')
        return { status: 'unavailable', reason: 'unavailable' };
      throw error;
    }
  },
};
