import { defineModule, defineModuleCatalog } from '@backbricks/core';
import { z } from '@hono/zod-openapi';

const label = { en: 'Sample', de: 'Beispiel' };
export const sampleConfig = z
  .object({
    title: z.string().default('Default title'),
    fields: z.array(z.string()).default(['email']),
    options: z
      .object({ caption: z.string().optional(), enabled: z.boolean() })
      .strict()
      .default({ enabled: true }),
  })
  .strict();

/** Synthetic configuration only; no domain tables or production API. */
export function instanceCatalog(classify = true) {
  return defineModuleCatalog([
    defineModule({
      type: 'sample',
      moduleVersion: 1,
      displayName: label,
      resourceName: { singular: 'sample', plural: 'samples' },
      infrastructure: [],
      configSchema: sampleConfig,
      defaultConfig: () => sampleConfig.parse({}),
      scopes: [],
      events: [],
      usageMetrics: [{ name: 'sample.recomputed', kind: 'counter', unit: 'count', label }],
      ...(classify
        ? {
            validateConfigChange(
              previous: z.infer<typeof sampleConfig>,
              next: z.infer<typeof sampleConfig>,
            ) {
              return {
                destructive: previous.fields.some((field) => !next.fields.includes(field)),
                changedPaths: ['$'],
                warnings: [],
              };
            },
          }
        : {}),
      retention: {
        purgeExpired: async () => 0,
        recomputeExpiry: async (ctx) => {
          await ctx.services.usage.increment(ctx.tx, { metric: 'sample.recomputed', delta: 1n });
          return 0;
        },
      },
      privacy: { exportSubject: async () => [], deleteSubject: async () => 0 },
    }),
  ]);
}
