import { emailAddressSchema } from '@backbricks/core';
import { z } from 'zod';

import { REVIEW_LIMITS as limits } from './constants.ts';

export const reviewTextSchema = z
  .string()
  .trim()
  .refine(
    (value) => value.isWellFormed() && !value.includes(String.fromCharCode(0)),
    'Enter valid Unicode text.',
  );

export const reviewFieldsSchema = z.record(
  z.string().regex(/^[a-z][a-z0-9_]*$/),
  reviewTextSchema.min(1).max(limits.fieldValueLength),
);

const { $schema: _schema, ...fieldDocument } = z.toJSONSchema(reviewFieldsSchema);
const submittedFields = z
  .unknown()
  .refine(
    (value) =>
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      !Object.hasOwn(value, '__proto__'),
    'Enter valid extra fields.',
  )
  .meta(fieldDocument)
  .pipe(reviewFieldsSchema);

export const reviewBodySchema = z
  .object({
    rating: z.number().int().min(limits.ratingMin).max(limits.scaleMax),
    authorName: reviewTextSchema.min(1).max(limits.nameLength),
    email: z.string().trim().toLowerCase().pipe(emailAddressSchema).optional(),
    title: reviewTextSchema.min(1).max(limits.titleLength).optional(),
    body: reviewTextSchema.min(1).max(limits.bodyLength).optional(),
    fields: submittedFields.optional(),
  })
  .strict();
