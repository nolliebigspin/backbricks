import { fileAttachmentSchema, type FileAttachment } from '@backbricks/core';

import type { UploadRecord } from './repository.ts';

/** One projection for module management and borrowed owner reads; private storage fields stay private. */
export function attachmentMetadata(file: UploadRecord): FileAttachment {
  return fileAttachmentSchema.parse({
    id: file.id,
    zoneId: file.instanceId,
    name: file.originalName,
    size: file.sizeBytes,
    type: file.detectedMime,
    status: file.status,
    scanStatus: file.scan?.status ?? null,
    expiresAt: file.expiresAt?.toISOString() ?? null,
  });
}
