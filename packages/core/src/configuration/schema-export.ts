import { z } from 'zod';

import { instanceKeySchema } from '../instances/schemas.ts';
import type { ModuleRegistry } from '../modules/registry.ts';
import { jsonValueSchema } from '../modules/values.ts';
import { CONFIG_SCHEMA_ID, configDocumentSchema, configEntrySchema } from './schemas.ts';

/** Offline editor schema, derived from the same envelope and selected module schemas as validation. */
export function configurationJsonSchema(registry: ModuleRegistry): Record<string, unknown> {
  const root = z.toJSONSchema(configDocumentSchema);
  const entry = z.toJSONSchema(configEntrySchema);
  const schema = {
    ...root,
    $id: CONFIG_SCHEMA_ID,
    properties: {
      ...root.properties,
      modules: {
        type: 'object',
        additionalProperties: false,
        properties: Object.fromEntries(
          registry.modules.map((module) => [
            module.resourceName.plural,
            {
              type: 'object',
              propertyNames: z.toJSONSchema(instanceKeySchema),
              additionalProperties: {
                ...entry,
                properties: {
                  ...entry.properties,
                  moduleVersion: { const: module.moduleVersion },
                  config: module.configJsonSchema,
                },
              },
            },
          ]),
        ),
      },
    },
  };
  jsonValueSchema.parse(schema);
  return schema;
}
