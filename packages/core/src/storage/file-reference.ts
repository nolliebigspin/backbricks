import { z } from 'zod';

import { isTypeId } from '../ids/type-id.ts';

/** High-entropy bearer material is passed only in request bodies, never as a URL credential. */
export const UPLOAD_TOKEN_PREFIX = 'bbu_';
export const UPLOAD_TOKEN_BYTES = 32;
export const uploadTokenSchema = z
  .string()
  .regex(new RegExp(`^${UPLOAD_TOKEN_PREFIX}[a-f0-9]{${UPLOAD_TOKEN_BYTES * 2}}$`));
export const fileIdSchema = z
  .string()
  .max(64)
  .refine((value) => isTypeId(value, 'file'), 'Invalid file ID.');
/** One wire reference used by uploads, forms and the files capability. */
export const fileReferenceSchema = z
  .string()
  .max(140)
  .refine((value) => {
    const [id, token, extra] = value.split('.');
    return (
      extra === undefined &&
      fileIdSchema.safeParse(id).success &&
      uploadTokenSchema.safeParse(token).success
    );
  }, 'Invalid file reference.');
export type FileReference = z.infer<typeof fileReferenceSchema>;

/** Split only after validation; credentials never appear in error details. */
export function parseFileReference(value: unknown): { fileId: string; uploadToken: string } | null {
  const parsed = fileReferenceSchema.safeParse(value);
  if (!parsed.success) return null;
  const [fileId, uploadToken] = parsed.data.split('.');
  return fileId && uploadToken ? { fileId, uploadToken } : null;
}
