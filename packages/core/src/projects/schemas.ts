import { z } from 'zod';

import { allowedOriginsSchema } from '../http/origins.ts';
import { projectSchema } from '../platform/models.ts';

export const PROJECT_NAME_MAX_LENGTH = 120;
export const PROJECT_SLUG_MAX_LENGTH = 63;

/** Settings are reserved until a platform feature defines a typed setting; unknown knobs fail. */
export const projectSettingsSchema = z.object({}).strict();
const projectFields = z
  .object({
    name: z.string().trim().min(1).max(PROJECT_NAME_MAX_LENGTH),
    slug: z
      .string()
      .min(1)
      .max(PROJECT_SLUG_MAX_LENGTH)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    allowedOrigins: allowedOriginsSchema,
    settings: projectSettingsSchema,
  })
  .strict();

/** Organization, ID, lifecycle and timestamps are always supplied by the trusted service. */
export const projectCreateSchema = projectFields.extend({
  allowedOrigins: allowedOriginsSchema.default([]),
  settings: projectSettingsSchema.default({}),
});
export const projectPatchSchema = projectFields
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one project field is required.',
  });
export type ProjectCreate = z.infer<typeof projectCreateSchema>;
export type ProjectPatch = z.infer<typeof projectPatchSchema>;

/** Safe management projection; Date fields are serialized explicitly at the wire boundary. */
export const projectResponseSchema = projectSchema.omit({ deletedAt: true }).extend({
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
