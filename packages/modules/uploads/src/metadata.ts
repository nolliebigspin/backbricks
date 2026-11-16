import { fileAttachmentSchema, inlineImageTypeSchema, type FileAttachment } from '@backbricks/core';

import { fileItemSchema } from './admin-schemas.ts';
import type { UploadRecord } from './repository.ts';
import { isUsableFile } from './usability.ts';

/** One projection for module management and borrowed owner reads; private storage fields stay private. */
export function attachmentMetadata(file: UploadRecord, now: Date): FileAttachment {
  return fileAttachmentSchema.parse({
    id: file.id,
    zoneId: file.instanceId,
    name: file.originalName,
    size: file.sizeBytes,
    type: file.detectedMime,
    status: file.status,
    previewable:
      isUsableFile(file, now) && inlineImageTypeSchema.safeParse(file.detectedMime).success,
    scanStatus: file.scan?.status ?? null,
    expiresAt: file.expiresAt?.toISOString() ?? null,
  });
}

export function fileManagementMetadata(file: UploadRecord, now: Date) {
  return fileItemSchema.parse({
    ...attachmentMetadata(file, now),
    createdAt: file.createdAt.toISOString(),
    updatedAt: file.updatedAt.toISOString(),
    isTest: file.isTest,
    owner: file.ownerType && file.ownerId ? { type: file.ownerType, id: file.ownerId } : null,
  });
}
