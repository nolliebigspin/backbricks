import { z } from 'zod';

/** Shared by the files capability, upload validation and database constraints. */
export const FILE_SIZE_LIMITS = { maxSizeMb: 100, bytesPerMb: 1024 * 1024 } as const;
/** File-domain bound reused by declarations, attachments and persistence. */
export const fileSizeSchema = z
  .number()
  .int()
  .positive()
  .max(FILE_SIZE_LIMITS.maxSizeMb * FILE_SIZE_LIMITS.bytesPerMb);
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

/** Durable states that may still need immutable-copy inspection. */
export const FILE_INSPECTION_STATES = [
  'uploaded',
  'scanning',
] as const satisfies readonly FileStatus[];
/** Shared inspection eligibility for workers and maintenance queries. */
export const isAwaitingFileInspection = (status: FileStatus): boolean =>
  FILE_INSPECTION_STATES.some((candidate) => candidate === status);
