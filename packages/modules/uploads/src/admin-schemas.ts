import {
  dateRangeQuerySchema,
  fileAttachmentSchema,
  fileOwnerSchema,
  pageQuerySchema,
  unsignedIntegerStringSchema,
  isTypeId,
  jsonValueWireSchema,
} from '@backbricks/core';
import { z } from 'zod';

import { uploadStatusSchema } from './values.ts';

export const filesQuerySchema = dateRangeQuerySchema.safeExtend({
  ...pageQuerySchema.shape,
  zoneId: z
    .string()
    .max(128)
    .refine((id) => isTypeId(id, 'mod'))
    .optional(),
  status: uploadStatusSchema.optional(),
  q: z.string().trim().max(200).optional(),
});
export const fileItemSchema = fileAttachmentSchema.extend({
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  isTest: z.boolean(),
  owner: fileOwnerSchema.nullable(),
});
export const fileDetailSchema = fileItemSchema.extend({
  metadata: z.record(z.string(), jsonValueWireSchema),
});
export const filesPageSchema = z
  .object({ data: z.array(fileItemSchema), nextCursor: z.string().nullable() })
  .strict();
export const storageUsageSchema = z
  .object({
    count: unsignedIntegerStringSchema,
    storedBytes: unsignedIntegerStringSchema,
    reservedBytes: unsignedIntegerStringSchema,
  })
  .strict();
