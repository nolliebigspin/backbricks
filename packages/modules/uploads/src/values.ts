import { storageGetSchema } from '@backbricks/core';
import { z } from 'zod';

/** Stored state; logical deletion is a separate marker, so cleanup can finish after access ends. */
export const uploadStatusSchema = z.enum([
  'pending',
  'uploaded',
  'scanning',
  'ready',
  'quarantined',
  'rejected',
]);
export type UploadStatus = z.infer<typeof uploadStatusSchema>;

/** A private display/download name, never a path or storage key. */
export const uploadFilenameSchema = storageGetSchema.shape.downloadName
  .unwrap()
  .refine(
    (name) =>
      name.isWellFormed() &&
      name === name.trim() &&
      !/[/\\\p{Cc}\p{Cf}]/u.test(name) &&
      name.lastIndexOf('.') > 0 &&
      !name.endsWith('.'),
    { message: 'Use a filename with an extension, without paths or control characters.' },
  );
