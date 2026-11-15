import { z } from 'zod';

import { MAX_BULK_ITEMS } from '../http/bulk.ts';
import { instanceKeySchema } from '../instances/schemas.ts';
import { activityIdentifierSchema, activityNameSchema } from '../platform/activity-fields.ts';
import { emailAddressSchema } from '../platform/values.ts';
import { fileIdSchema, fileReferenceSchema } from './file-reference.ts';
import { fileSizeSchema, fileStatusSchema } from './files.ts';
import { storageGetSchema } from './schemas.ts';

/** Provider-neutral persisted scan outcome, separate from the file's lifecycle status. */
export const fileScanStatusSchema = z.enum([
  'clean',
  'not_scanned',
  'infected',
  'failed',
  'retrying',
]);
export const fileScanResultSchema = z
  .object({
    status: fileScanStatusSchema,
    checkedAt: z.iso.datetime().optional(),
    reason: activityNameSchema.optional(),
  })
  .strict();
export type FileScanResult = z.infer<typeof fileScanResultSchema>;
/** Safe owner-bound metadata; never includes bearer material, object keys or scan signatures. */
export const fileAttachmentSchema = z
  .object({
    id: fileIdSchema,
    zoneId: z.string(),
    name: storageGetSchema.shape.downloadName.unwrap(),
    size: fileSizeSchema,
    type: z.string().nullable(),
    status: fileStatusSchema,
    scanStatus: fileScanStatusSchema.nullable(),
    previewable: z.boolean(),
    expiresAt: z.iso.datetime().nullable(),
  })
  .strict();
export type FileAttachment = z.infer<typeof fileAttachmentSchema>;
export const fileOwnerSchema = z
  .object({ type: activityIdentifierSchema.max(64), id: activityIdentifierSchema })
  .strict();
export type FileOwner = z.infer<typeof fileOwnerSchema>;
export const fileClaimSchema = z
  .object({
    owner: fileOwnerSchema,
    subjectEmail: emailAddressSchema.toLowerCase().nullable(),
    expiresAt: z.date().nullable(),
    files: z
      .array(z.object({ ref: fileReferenceSchema, zone: instanceKeySchema }).strict())
      .min(1)
      .max(MAX_BULK_ITEMS),
  })
  .strict();
export type FileClaim = z.infer<typeof fileClaimSchema>;
/** Trusted owner lifetimes, synchronized in bounded batches in the owner's mutation transaction. */
export const fileOwnerExpirySchema = z
  .object({
    type: fileOwnerSchema.shape.type,
    owners: z
      .array(z.object({ id: fileOwnerSchema.shape.id, expiresAt: z.date().nullable() }).strict())
      .min(1)
      .max(MAX_BULK_ITEMS),
  })
  .strict();
export type FileOwnerExpiry = z.infer<typeof fileOwnerExpirySchema>;
