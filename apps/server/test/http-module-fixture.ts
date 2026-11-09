import { defineModule } from '@backbricks/core';
import { z } from '@hono/zod-openapi';

const amount = z
  .string()
  .regex(/^[1-9][0-9]*$/)
  .transform(BigInt);
const label = { en: 'Counter fixture', de: 'Zählertest' };
const configSchema = z.object({ enabled: z.boolean().default(true) }).strict();

/** Test-only module: its shared usage writes let real HTTP/job tests observe the transaction. */
export function counterModule() {
  return defineModule({
    type: 'counter',
    moduleVersion: 1,
    displayName: label,
    resourceName: { singular: 'counter', plural: 'counters' },
    infrastructure: [],
    configSchema,
    defaultConfig: () => configSchema.parse({}),
    scopes: [
      { name: 'counter:write', description: label },
      { name: 'counter:read', description: label },
    ],
    events: [],
    usageMetrics: [{ name: 'counter.total', kind: 'counter', unit: 'count', label }],
    adminRoutes(router) {
      router.register(
        {
          method: 'POST',
          path: '/{key}/counts',
          operationId: 'counter.increment',
          input: z.object({
            params: z.object({ key: z.string() }),
            query: z.object({}),
            body: z.object({ amount, fail: z.boolean().default(false) }).strict(),
          }),
          responses: {
            201: {
              kind: 'json',
              description: 'Saved count',
              schema: z.object({ saved: z.string() }),
            },
          },
          policy: {
            kind: 'management',
            bodyLimitBytes: 128,
            session: { role: 'admin' },
            secretKey: { scope: 'counter:write' },
            isolationCase: 'counter.increment',
          },
        },
        async (ctx, input) => {
          await ctx.services.usage.increment(ctx.tx, {
            metric: 'counter.total',
            delta: input.body.amount,
          });
          await ctx.services.audit.record(ctx.tx, {
            actorType: 'system',
            action: input.body.fail ? 'counter.fail' : 'counter.incremented',
          });
          return Response.json(
            { saved: input.body.amount.toString(), private: 'hidden' },
            { status: 201 },
          );
        },
      );
      router.register(
        {
          method: 'GET',
          path: '/{key}/counts',
          operationId: 'counter.read',
          input: z.object({
            params: z.object({ key: z.string() }),
            query: z.object({
              scale: z
                .string()
                .regex(/^[1-9][0-9]*$/)
                .default('1')
                .transform(Number),
            }),
            body: z.null(),
          }),
          responses: {
            200: {
              kind: 'json',
              description: 'Aggregate',
              schema: z.object({ total: z.string(), scale: z.number() }),
            },
          },
          policy: {
            kind: 'management',
            bodyLimitBytes: 128,
            session: { role: 'member' },
            secretKey: { scope: 'counter:read' },
            isolationCase: 'counter.read',
          },
        },
        async (ctx, input) => {
          const rows = await ctx.services.usage.list(ctx.tx);
          return Response.json({
            total: (rows[0]?.value ?? 0n).toString(),
            scale: input.query.scale,
          });
        },
      );
    },
    publicRoutes(router) {
      router.register(
        {
          method: 'GET',
          path: '/{key}/summary',
          operationId: 'counter.public',
          input: z.object({
            params: z.object({ key: z.string() }),
            query: z.object({}),
            body: z.null(),
          }),
          responses: {
            200: {
              kind: 'json',
              description: 'Public summary',
              schema: z.object({ available: z.boolean() }),
            },
          },
          policy: { kind: 'public', bodyLimitBytes: 128 },
          access: { kind: 'read' },
        },
        async () => Response.json({ available: true }),
      );
    },
    jobs(registrar) {
      registrar.register(
        { name: 'counter.increment', retentionSeconds: 3600, retries: 2 },
        z.object({ amount }).strict(),
        async (ctx, input) => {
          await ctx.services.usage.increment(ctx.tx, {
            metric: 'counter.total',
            delta: input.amount,
          });
          await ctx.services.audit.record(ctx.tx, {
            actorType: 'system',
            action: 'counter.job_completed',
          });
        },
      );
    },
    retention: { purgeExpired: async () => 0, recomputeExpiry: async () => 0 },
    privacy: {
      exportSubject: async () => [],
      deleteSubject: async () => 0,
      eraseScope: async () => 0,
    },
  });
}
