import { z } from 'zod';

/** Shared by the files capability, upload validation and database constraints. */
export const FILE_SIZE_LIMITS = { maxSizeMb: 100, bytesPerMb: 1024 * 1024 } as const;
/** Stored file state; access revocation/physical cleanup use a separate durable deletion marker. */
export const fileStatusSchema = z.enum([
  'pending',
  'uploaded',
  'scanning',
  'ready',
  'quarantined',
  'rejected',
]);
export type FileStatus = z.infer<typeof fileStatusSchema>;
