import type { UploadRecord } from './repository.ts';

/** A ready label alone cannot authorize bytes: inspection, immutable copy and lifetime must agree. */
export function isUsableFile(file: UploadRecord, now: Date): boolean {
  return (
    file.status === 'ready' &&
    file.deletedAt === null &&
    file.storageCleanedAt === null &&
    file.copiedAt !== null &&
    file.sha256 !== null &&
    file.detectedMime !== null &&
    (file.scan?.status === 'clean' || file.scan?.status === 'not_scanned') &&
    (file.expiresAt === null || file.expiresAt > now)
  );
}
