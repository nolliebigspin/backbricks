// Test-only definitions import the same public contract as domain modules; no DB/server imports.
import { defineModule, type TenantHandle } from '@backbricks/core';
import { z } from 'zod';

export interface LedgerCapability {
  append(tx: TenantHandle, amount: bigint): Promise<void>;
}
declare module '@backbricks/core' {
  interface CapabilityMap {
    readonly 'fixture-ledger': LedgerCapability;
  }
  interface ModuleRepositories {
    readonly ledger: { append(amount: bigint): Promise<void> };
  }
}
const label = { en: 'Fixture', de: 'Test' };
const configSchema = z.object({ limit: z.number().int().positive().default(10) }).strict();
const emptyHooks = {
  retention: { purgeExpired: async () => 0, recomputeExpiry: async () => 0 },
  privacy: {
    exportSubject: async () => [],
    deleteSubject: async () => 0,
    eraseScope: async () => 0,
  },
};
export function ledgerModule() {
  return defineModule({
    type: 'ledger',
    moduleVersion: 1,
    displayName: label,
    resourceName: { singular: 'entry', plural: 'entries' },
    infrastructure: [],
    configSchema,
    defaultConfig: () => configSchema.parse({}),
    scopes: [],
    events: [],
    usageMetrics: [],
    provides: {
      'fixture-ledger': (ctx) => ({
        append(_tx, amount) {
          if (!ctx.repository) throw new Error('Missing ledger repository binding');
          return ctx.repository.append(amount);
        },
      }),
    },
    ...emptyHooks,
  });
}
export function consumerModule() {
  return defineModule({
    type: 'consumer',
    moduleVersion: 1,
    displayName: label,
    resourceName: { singular: 'receipt', plural: 'receipts' },
    infrastructure: [],
    configSchema,
    defaultConfig: () => configSchema.parse({}),
    scopes: [],
    events: [{ name: 'consumer.appended', description: label }],
    usageMetrics: [{ name: 'consumer.appends', kind: 'counter', unit: 'count', label }],
    requires: ['fixture-ledger'],
    optional: ['absent-capability'],
    services: { optional: ['mailer'] },
    adminRoutes(router) {
      router.register(
        {
          method: 'POST',
          path: '/{key}/records',
          operationId: 'consumer.append',
          input: z.object({
            params: z.object({ key: z.string() }),
            query: z.object({}),
            body: z.object({
              amount: z.string().regex(/^[1-9][0-9]*$/),
              failAudit: z.boolean().default(false),
            }),
          }),
          responses: {
            201: {
              kind: 'json',
              description: 'Receipt',
              schema: z.object({ saved: z.literal(true) }),
            },
          },
          policy: {
            kind: 'management',
            session: { role: 'admin' },
            bodyLimitBytes: 1024,
            isolationCase: 'consumer.append',
          },
        },
        async (ctx, input) => {
          if (
            Reflect.has(ctx.tx, 'repositories') ||
            Reflect.has(ctx.tx, 'modules') ||
            ctx.repository !== undefined
          )
            throw new Error('Module received another repository');
          if (
            ctx.capabilities.optional('absent-capability') !== null ||
            ctx.services.optional('mailer') !== null
          )
            throw new Error('Missing optional provider must be null');
          // Compile-time restrictions are part of the fixture's contract check.
          if (input.params.key === 'compile-time-errors-only') {
            // @ts-expect-error Module callbacks cannot reach platform key repositories.
            ctx.tx.repositories.keys.list();
            // @ts-expect-error Only declared capabilities can be required.
            ctx.capabilities.require('undeclared');
            // @ts-expect-error Only declared services can be used.
            ctx.services.require('storage');
            // @ts-expect-error Capability arguments retain the augmented contract's types.
            await ctx.capabilities.require('fixture-ledger').append(ctx.tx, 'not bigint');
          }
          await ctx.services.usage.increment(ctx.tx, { metric: 'consumer.appends', delta: 1n });
          await ctx.capabilities
            .require('fixture-ledger')
            .append(ctx.tx, BigInt(input.body.amount));
          await ctx.services.events.publish(ctx.tx, { type: 'consumer.appended' });
          await ctx.services.audit.record(ctx.tx, {
            actorType: 'system',
            action: input.body.failAudit ? 'consumer.fail' : 'consumer.appended',
          });
          return Response.json(
            { saved: true, privateContent: 'must be stripped' },
            { status: 201 },
          );
        },
      );
    },
    publicRoutes(router) {
      router.register(
        {
          method: 'GET',
          path: '/{key}/summary',
          operationId: 'consumer.summary',
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
          policy: { kind: 'public', bodyLimitBytes: 1024 },
          access: { kind: 'read' },
        },
        async () =>
          Response.json(
            { available: true, subjectEmail: 'private@example.invalid' },
            {
              headers: { 'content-type': 'text/html' },
            },
          ),
      );
    },
    jobs(registrar) {
      registrar.register(
        { name: 'consumer.append', retries: 2, retentionSeconds: 3600 },
        z.object({ amount: z.string().regex(/^[1-9][0-9]*$/) }).strict(),
        async (ctx, payload) => {
          await ctx.capabilities.require('fixture-ledger').append(ctx.tx, BigInt(payload.amount));
        },
      );
    },
    codegen: (instance) => `export type Limit = ${instance.config.limit};`,
    ...emptyHooks,
  });
}
