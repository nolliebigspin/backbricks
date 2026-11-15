import { fileAttachmentSchema, type FileAttachment } from '@backbricks/core';

import { fileItemSchema } from './admin-schemas.ts';
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

export function fileManagementMetadata(file: UploadRecord) {
  return fileItemSchema.parse({
    ...attachmentMetadata(file),
    createdAt: file.createdAt.toISOString(),
    updatedAt: file.updatedAt.toISOString(),
    isTest: file.isTest,
    owner: file.ownerType && file.ownerId ? { type: file.ownerType, id: file.ownerId } : null,
  });
}
