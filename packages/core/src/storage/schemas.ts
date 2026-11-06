import { z } from 'zod';

export const MAX_SIGNED_PUT_TTL_SECONDS = 900;
export const MAX_SIGNED_GET_TTL_SECONDS = 300;
/** Storage names are opaque path segments. Original filenames belong only in download disposition. */
export const storageKeySchema = z
  .string()
  .min(1)
  .max(1024)
  .regex(/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/);
export const inlineImageTypeSchema = z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
export const storagePutSchema = z
  .object({
    key: storageKeySchema,
    contentType: z
      .string()
      .min(1)
      .max(255)
      .regex(/^[\x20-\x7e]+$/),
    size: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    expiresInSeconds: z.number().int().positive().max(MAX_SIGNED_PUT_TTL_SECONDS),
  })
  .strict();
export const storageGetSchema = z
  .object({
    key: storageKeySchema,
    expiresInSeconds: z.number().int().positive().max(MAX_SIGNED_GET_TTL_SECONDS),
    downloadName: z
      .string()
      .min(1)
      .max(255)
      // oxlint-disable-next-line no-control-regex -- Header filenames must reject every control character.
      .regex(/^[^\x00-\x1f\x7f]*$/)
      .optional(),
    inlineImageType: inlineImageTypeSchema.optional(),
  })
  .strict();
export const storageObjectSchema = z
  .object({ size: z.number().int().nonnegative(), contentType: z.string().nullable() })
  .strict();
export const signedStorageRequestSchema = z
  .object({ url: z.url(), headers: z.record(z.string(), z.string()) })
  .strict();
