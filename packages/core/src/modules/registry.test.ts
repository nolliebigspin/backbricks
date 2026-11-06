import { expect, test } from 'bun:test';

import { z } from 'zod';

import {
  createAuditService,
  createEventService,
  createIds,
  createRateLimiter,
  createServiceContainer,
  createUnlimitedEntitlements,
  createUsageService,
  defineModule,
  defineRegistry,
} from '../index.ts';

const label = { en: 'Fixture', de: 'Test' };
const configSchema = z
  .object({ title: z.string().default('Untitled'), limit: z.number().int().min(1).default(10) })
  .strict();
const base = {
  type: 'sample',
  moduleVersion: 2,
  displayName: label,
  resourceName: { singular: 'sample', plural: 'samples' },
  infrastructure: [],
  configSchema,
  defaultConfig: () => configSchema.parse({}),
  scopes: [],
  events: [],
  usageMetrics: [],
  retention: { purgeExpired: async () => 0, recomputeExpiry: async () => 0 },
  privacy: { exportSubject: async () => [], deleteSubject: async () => 0 },
} as const;
function other() {
  return defineModule({
    ...base,
    type: 'other',
    resourceName: { singular: 'other', plural: 'others' },
  });
}
const clock = { now: () => new Date('2026-11-06T00:00:00Z') };
function container() {
  const common = { clock, ids: createIds(clock) };
  return createServiceContainer({
    ...common,
    audit: createAuditService(common),
    events: createEventService(common),
    usage: createUsageService(clock),
    entitlements: createUnlimitedEntitlements(),
    rateLimiter: createRateLimiter({ increment: async () => 1 }, clock),
  });
}

test('static registries reject duplicate identities, resources, scopes, events, providers and routes', () => {
  const first = defineModule(base);
  expect(() => defineRegistry([first, first])).toThrow('Duplicate module type');
  expect(() => defineRegistry([first, defineModule({ ...base, type: 'other' })])).toThrow(
    'resource name',
  );
  const scope = { name: 'sample:write', description: label };
  expect(() => defineRegistry([defineModule({ ...base, scopes: [scope, scope] })])).toThrow(
    'scope',
  );
  const event = { name: 'sample.created', description: label };
  expect(() => defineRegistry([defineModule({ ...base, events: [event, event] })])).toThrow(
    'event',
  );
  const provided = { shared: () => ({ read: () => Promise.resolve(null) }) };
  expect(() =>
    defineRegistry([
      defineModule({ ...base, provides: provided }),
      defineModule({
        ...base,
        type: 'other',
        resourceName: { singular: 'other', plural: 'others' },
        provides: provided,
      }),
    ]),
  ).toThrow('capability provider');
  expect(() =>
    defineRegistry([defineModule({ ...base, scopes: [{ ...scope, name: 'project:write' }] })]),
  ).toThrow('belong');
  expect(() =>
    defineRegistry([defineModule({ ...base, events: [{ ...event, name: 'project.created' }] })]),
  ).toThrow('platform events');
  const metric = { name: 'sample.count', kind: 'counter', unit: 'count', label } as const;
  expect(() => defineRegistry([defineModule({ ...base, usageMetrics: [metric, metric] })])).toThrow(
    'metric',
  );
  expect(defineRegistry([first, other()]).modules).toHaveLength(2);
});

test('providers precede consumers, optional providers may be absent, cycles/missing requirements fail', () => {
  const provider = defineModule({ ...base, provides: { shared: () => ({ read: () => null }) } });
  const consumer = defineModule({
    ...base,
    type: 'other',
    resourceName: { singular: 'other', plural: 'others' },
    requires: ['shared'],
  });
  expect(defineRegistry([consumer, provider]).modules.map((module) => module.type)).toEqual([
    'sample',
    'other',
  ]);
  expect(() => defineRegistry([consumer])).toThrow('Required capability is unavailable: shared');
  const optional = defineModule({ ...base, optional: ['missing'] });
  expect(defineRegistry([optional]).bind(container())).toBeDefined();
  expect(() =>
    defineRegistry([
      defineModule({ ...base, requires: ['shared'], provides: { shared: () => ({}) } }),
    ]),
  ).toThrow('cycle');
  expect(() =>
    defineRegistry([defineModule({ ...base, requires: ['shared'], optional: ['shared'] })]),
  ).toThrow('requirement');
  const left = defineModule({ ...base, requires: ['right'], provides: { left: () => ({}) } });
  const right = defineModule({
    ...base,
    type: 'other',
    resourceName: { singular: 'other', plural: 'others' },
    requires: ['left'],
    provides: { right: () => ({}) },
  });
  expect(() => defineRegistry([left, right])).toThrow('cycle');
});

test('required infrastructure fails at bind; absent optional providers and empty registry work', () => {
  const storage = defineModule({ ...base, infrastructure: [{ service: 'storage' }] });
  expect(() => defineRegistry([storage]).bind(container())).toThrow(
    'Required service is unavailable: storage',
  );
  const scanner = defineModule({
    ...base,
    infrastructure: [{ service: 'scanner', optional: true }],
  });
  expect(defineRegistry([scanner]).bind(container())).toBeDefined();
  expect(defineRegistry([]).bind(container())).toBeDefined();
  expect(() =>
    defineModule({
      ...base,
      infrastructure: [{ service: 'storage' }],
      services: { optional: ['storage'] },
    }),
  ).toThrow('both required and optional');
});

test('configuration defaults, migrations and change classification use validated JSON values', () => {
  const module = defineModule({
    ...base,
    templates: { contact: { name: 'Contact', config: { title: 'Contact', limit: 5 } } },
    migrateConfig: (_version, value) => configSchema.parse(value),
    validateConfigChange: (before, after) => ({
      destructive: after.limit < before.limit,
      changedPaths: ['limit'],
      warnings: [],
    }),
    codegen: (instance) => `export type Limit = ${instance.config.limit};`,
  });
  expect(module.defaultConfig()).toEqual({ title: 'Untitled', limit: 10 });
  expect(module.configJsonSchema).toMatchObject({
    type: 'object',
    properties: { title: { type: 'string' } },
  });
  expect(module.templates['contact']?.config).toEqual({ title: 'Contact', limit: 5 });
  expect(module.migrateConfig(1, { limit: 7 })).toEqual({ title: 'Untitled', limit: 7 });
  expect(() => module.migrateConfig(3, {})).toThrow();
  expect(
    module.validateConfigChange({ title: 'A', limit: 10 }, { limit: 10, title: 'A' }).destructive,
  ).toBe(false);
  expect(module.validateConfigChange({}, { limit: 1 }).destructive).toBe(true);
  const conservative = defineModule(base);
  expect(conservative.validateConfigChange({}, { title: 'Changed' }).destructive).toBe(true);
  expect(() => conservative.migrateConfig(1, {})).toThrow('migration is required');
  expect(() => module.parseConfig({ limit: 0 })).toThrow();
  expect(() =>
    defineModule({ ...base, configSchema: z.date(), defaultConfig: () => clock.now() }),
  ).toThrow('representable');
});

test('routes and jobs require policy, schemas, bounded retention and unique declarations', () => {
  const spec = {
    method: 'GET',
    path: '/{key}/records',
    operationId: 'sample.records',
    input: z.object({ params: z.object({ key: z.string() }), query: z.object({}), body: z.null() }),
    responses: {
      200: { kind: 'json', description: 'Records', schema: z.object({ count: z.number() }) },
    },
    policy: {
      kind: 'management',
      session: { role: 'member' },
      bodyLimitBytes: 1024,
      isolationCase: 'sample.records',
    },
  } as const;
  const duplicate = defineModule({
    ...base,
    adminRoutes(router) {
      router.register(spec, async () => Response.json({ count: 1 }));
      router.register({ ...spec, operationId: 'sample.other' }, async () =>
        Response.json({ count: 2 }),
      );
    },
  });
  expect(() => defineRegistry([duplicate])).toThrow('route');
  expect(() =>
    defineModule({
      ...base,
      publicRoutes(router) {
        router.register(
          {
            ...spec,
            policy: { kind: 'public', bodyLimitBytes: 1024 },
            access: { kind: 'read' },
            responses: { 200: { kind: 'csv', description: 'Export' } },
          },
          async () => new Response('private'),
        );
      },
    }),
  ).toThrow();
  expect(() =>
    defineModule({
      ...base,
      jobs(registrar) {
        registrar.register(
          { name: 'sample.cleanup', retries: 1, retentionSeconds: 0 },
          z.object({}),
          async () => {},
        );
      },
    }),
  ).toThrow();
  expect(() =>
    defineRegistry([
      defineModule({
        ...base,
        adminRoutes(router) {
          router.register(
            { ...spec, policy: { ...spec.policy, secretKey: { scope: 'unknown:write' } } },
            async () => Response.json({ count: 1 }),
          );
        },
      }),
    ]),
  ).toThrow('undeclared scope');
});
