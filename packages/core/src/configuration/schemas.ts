import { z } from 'zod';

import { isTypeId } from '../ids/type-id.ts';
import {
  instanceCreateSchema,
  instanceKeySchema,
  instanceVersionSchema,
} from '../instances/schemas.ts';
import { moduleNameSchema } from '../modules/values.ts';

export const CONFIG_SCHEMA_ID = 'https://backbricks.app/schema/config.v1.json';
export const CONFIG_PLAN_TTL_MS = 10 * 60 * 1000;
/** Explicit envelope prevents module fields from colliding with name/status/version metadata. */
export const configEntrySchema = instanceCreateSchema
  .omit({ key: true, template: true })
  .required({ config: true })
  .extend({
    moduleVersion: instanceVersionSchema,
    configVersion: instanceVersionSchema.optional(),
  });
export const configDocumentSchema = z
  .object({
    $schema: z.literal(CONFIG_SCHEMA_ID).default(CONFIG_SCHEMA_ID),
    project: z.string().refine((value) => isTypeId(value, 'prj')),
    modules: z.record(moduleNameSchema, z.record(instanceKeySchema, configEntrySchema)),
  })
  .strict();
export type ConfigDocument = z.infer<typeof configDocumentSchema>;
export const configChangeSchema = z
  .object({
    moduleType: moduleNameSchema,
    resource: moduleNameSchema,
    key: instanceKeySchema,
    kind: z.enum(['create', 'update', 'archive']),
    destructive: z.boolean(),
    changedPaths: z.array(z.string()),
  })
  .strict();
export const configPlanResponseSchema = z
  .object({
    changes: z.array(configChangeSchema),
    warnings: z.array(z.string()),
    destructive: z.boolean(),
    planHash: z.string(),
    expiresAt: z.iso.datetime(),
  })
  .strict();
export const configWriteSchema = z
  .object({ config: configDocumentSchema, planHash: z.string().max(1024).optional() })
  .strict();
export type ConfigWrite = z.infer<typeof configWriteSchema>;
export const configApplyResponseSchema = z
  .object({
    applied: z.literal(true),
    changes: z.array(configChangeSchema),
    warnings: z.array(z.string()),
  })
  .strict();
