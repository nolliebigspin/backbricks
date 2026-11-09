import { z } from 'zod';

import { AppError } from '../errors/app-error.ts';
import { activityIdentifierSchema } from '../platform/activity-fields.ts';
import type { OptionalServiceName } from '../services/container.ts';
import type { InfraRequirement } from './infrastructure.ts';
import {
  localizedNameSchema,
  moduleNameSchema,
  scopeDefinitionSchema,
  eventDefinitionSchema,
  metricDefinitionSchema,
  jsonValueSchema,
} from './values.ts';

const serviceNameSchema = z.enum(['storage', 'scanner', 'captcha', 'mailer', 'queue', 'billing']);
export const metadataSchema = z.object({
  type: moduleNameSchema,
  moduleVersion: z.number().int().positive(),
  displayName: localizedNameSchema,
  resourceName: z.object({ singular: moduleNameSchema, plural: moduleNameSchema }).strict(),
  scopes: z.array(scopeDefinitionSchema),
  events: z.array(eventDefinitionSchema),
  usageMetrics: z.array(metricDefinitionSchema),
  requires: z.array(activityIdentifierSchema),
  optional: z.array(activityIdentifierSchema),
  provides: z.array(activityIdentifierSchema),
  requiredServices: z.array(serviceNameSchema),
  optionalServices: z.array(serviceNameSchema),
});
export function serviceDeclarations(
  infrastructure: readonly InfraRequirement[],
  services?: {
    required?: readonly OptionalServiceName[];
    optional?: readonly OptionalServiceName[];
  },
) {
  const required = [
    ...(services?.required ?? []),
    ...infrastructure.filter((entry) => !entry.optional).map((entry) => entry.service),
  ];
  const optional = [
    ...(services?.optional ?? []),
    ...infrastructure.filter((entry) => entry.optional).map((entry) => entry.service),
  ];
  for (const name of optional)
    if (required.includes(name))
      throw new AppError('invalid_request', {
        detail: 'A module service cannot be both required and optional.',
      });
  return { requiredServices: [...new Set(required)], optionalServices: [...new Set(optional)] };
}
export function schemaDocument(schema: z.ZodType, io: 'input' | 'output' = 'output') {
  try {
    return z.record(z.string(), jsonValueSchema).parse(z.toJSONSchema(schema, { io }));
  } catch {
    throw new AppError('invalid_request', {
      detail: 'A module schema must have a representable JSON Schema.',
    });
  }
}
export function checkedCount(value: number): number {
  return z.number().int().nonnegative().parse(value);
}

/** Declaration metadata is JSON, so recursive freezing cannot traverse runtime/provider objects. */
export function freezeDeclaration<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    const children: unknown[] = Object.values(value);
    children.forEach(freezeDeclaration);
    Object.freeze(value);
  }
  return value;
}

export function uniqueModuleValues(values: readonly string[], label: string) {
  if (new Set(values).size !== values.length)
    throw new AppError('invalid_request', { detail: `Duplicate module ${label}.` });
}
