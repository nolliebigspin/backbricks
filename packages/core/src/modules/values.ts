import { z } from 'zod';

import { scopeNameSchema } from '../keys/protocol.ts';
import { activityNameSchema } from '../platform/activity-fields.ts';
import { metricNameSchema } from '../services/usage.ts';

export const moduleNameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
export const localizedNameSchema = z
  .object({ en: z.string().min(1).max(200), de: z.string().min(1).max(200) })
  .strict();
export const scopeDefinitionSchema = z
  .object({ name: scopeNameSchema, description: localizedNameSchema })
  .strict();
export const eventDefinitionSchema = z
  .object({ name: activityNameSchema, description: localizedNameSchema })
  .strict();
export const metricDefinitionSchema = z
  .object({
    name: metricNameSchema,
    kind: z.enum(['counter', 'gauge']),
    unit: z.enum(['count', 'bytes']),
    label: localizedNameSchema,
  })
  .strict();
export const configChangeReportSchema = z
  .object({
    destructive: z.boolean(),
    changedPaths: z.array(z.string().max(128)).max(1000),
    warnings: z.array(z.string().max(1000)).max(100),
  })
  .strict();
export const jsonValueSchema = z.json();
/** HTTP JSON is validated without exposing recursive Zod types to the OpenAPI adapter. */
export const jsonValueWireSchema = z
  .unknown()
  .refine((value) => jsonValueSchema.safeParse(value).success, {
    message: 'Expected a JSON value.',
  });
export type JsonValue = z.infer<typeof jsonValueSchema>;
export type ScopeDefinition = z.infer<typeof scopeDefinitionSchema>;
export type EventDefinition = z.infer<typeof eventDefinitionSchema>;
export type MetricDefinition = z.infer<typeof metricDefinitionSchema>;
export type ConfigChangeReport = z.infer<typeof configChangeReportSchema>;

/** Canonical JSON keeps schema/config comparisons independent of object insertion order. */
export function canonicalJson(value: JsonValue): string {
  function normalize(input: JsonValue): JsonValue {
    if (Array.isArray(input)) return input.map(normalize);
    if (input === null || typeof input !== 'object') return input;
    return Object.fromEntries(
      Object.entries(input)
        .toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => [key, normalize(item)]),
    );
  }
  return JSON.stringify(normalize(value));
}
