import { z } from 'zod';

import { jsonValueSchema } from '../modules/values.ts';
import { moduleInstanceSchema } from '../platform/models.ts';
import { moduleInstanceStatusSchema } from '../platform/values.ts';

export const MAX_INSTANCE_VERSION = 2_147_483_647;
export const instanceVersionSchema = z.number().int().positive().max(MAX_INSTANCE_VERSION);
export const instanceKeySchema = z
  .string()
  .min(1)
  .max(63)
  .regex(/^[a-z0-9][a-z0-9-]*$/);
const name = z.string().trim().min(1).max(120);
const writableStatus = moduleInstanceStatusSchema.exclude(['archived']);
// Keep recursive JSON out of HTTP type expansion and OpenAPI's unsupported lazy-schema traversal.
const configValue = z.unknown().refine((value) => jsonValueSchema.safeParse(value).success, {
  message: 'Configuration must contain only JSON values.',
});

/** Identity, parent, versions and archive lifecycle are service-owned. */
export const instanceCreateSchema = z
  .object({
    key: instanceKeySchema,
    name,
    status: writableStatus.default('active'),
    config: configValue.optional(),
  })
  .strict();
/** configVersion is the required optimistic precondition, never the assigned next version. */
export const instancePatchSchema = z
  .object({
    configVersion: instanceVersionSchema,
    name: name.optional(),
    status: writableStatus.optional(),
    config: configValue.optional(),
  })
  .strict()
  .refine(
    (value) => value.name !== undefined || value.status !== undefined || value.config !== undefined,
    {
      message: 'At least one instance field is required.',
    },
  );
export type InstanceCreate = z.input<typeof instanceCreateSchema>;
export type InstancePatch = z.infer<typeof instancePatchSchema>;

/** Authorized management projection; config is never included in public metadata. */
export const instanceResponseSchema = moduleInstanceSchema.extend({
  config: configValue,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
