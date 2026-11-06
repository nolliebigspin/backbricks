import { z } from 'zod';

import { isTypeId } from '../ids/type-id.ts';
import { API_KEY_PREFIXES } from '../keys/constants.ts';
import { actorTypeSchema } from './values.ts';

const MAX_METADATA_TEXT_LENGTH = 128;
export const activityTextSchema = z
  .string()
  .max(MAX_METADATA_TEXT_LENGTH)
  .refine((value) => !value.includes(API_KEY_PREFIXES.secret), {
    error: 'Secret-shaped metadata is not permitted.',
  });
export const activityIdentifierSchema = activityTextSchema.regex(/^[A-Za-z0-9_.-]+$/);
export const activityNameSchema = activityIdentifierSchema.regex(
  /^[a-z][a-z0-9_-]*(?:\.[a-z0-9_-]+)*$/i,
);
/** Equality filters only, always ANDed with the repository's immutable tenant scope. */
export const auditFiltersSchema = z
  .object({
    projectId: z
      .string()
      .refine((value) => isTypeId(value, 'prj'))
      .optional(),
    action: activityNameSchema.optional(),
    actorType: actorTypeSchema.optional(),
    actorId: activityIdentifierSchema.optional(),
  })
  .strict();
export type AuditFilters = z.infer<typeof auditFiltersSchema>;
