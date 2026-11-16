import { storageGetSchema } from '@backbricks/core';
export {
  fileStatusSchema as uploadStatusSchema,
  type FileStatus as UploadStatus,
} from '@backbricks/core';

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
