import { defineModule, publicWritePolicySchema } from '@backbricks/core';
import { z } from '@hono/zod-openapi';

const label = { en: 'Public fixture', de: 'Öffentlicher Test' };
const config = publicWritePolicySchema;
/** Test-only public handler; usage and outbox writes stand in for future domain persistence. */
export function publicModule() {
  return defineModule({
    type: 'publictest',
    moduleVersion: 1,
    displayName: label,
    resourceName: { singular: 'entry', plural: 'entries' },
    infrastructure: [],
    configSchema: config,
    defaultConfig: () => config.parse({}),
    publicWritePolicy: (value) => value,
    scopes: [{ name: 'publictest:submit', description: label }],
    events: [{ name: 'publictest.created', description: label }],
    usageMetrics: [{ name: 'publictest.accepted', kind: 'counter', unit: 'count', label }],
    publicRoutes(router) {
      router.register(
        {
          method: 'POST',
          path: '/{key}',
          operationId: 'publictest.submit',
          input: z.object({
            params: z.object({ key: z.string() }),
            query: z.object({}).strict(),
            body: z.object({ text: z.string().min(1).max(2000) }).strict(),
          }),
          responses: {
            201: {
              kind: 'json',
              description: 'Accepted entry.',
              schema: z
                .object({ accepted: z.literal(true), status: z.enum(['clean', 'suspect', 'spam']) })
                .strict(),
            },
          },
          policy: { kind: 'public', bodyLimitBytes: 16_384 },
          access: {
            kind: 'write',
            secretScope: 'publictest:submit',
            idempotency: { status: 201 },
            quota: { metric: 'publictest.accepted' },
          },
        },
        async (ctx) => {
          if (!ctx.publicWrite) throw new Error('Missing public write context');
          await ctx.services.usage.increment(ctx.tx, { metric: 'publictest.accepted', delta: 1n });
          await ctx.services.events.publish(ctx.tx, {
            type: 'publictest.created',
            payload: { status: ctx.publicWrite.spam.status },
          });
          return Response.json(
            { accepted: true, status: ctx.publicWrite.spam.status },
            { status: 201 },
          );
        },
      );
    },
    retention: { purgeExpired: async () => 0, recomputeExpiry: async () => 0 },
    privacy: { exportSubject: async () => [], deleteSubject: async () => 0 },
  });
}
