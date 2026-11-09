import { expect, test } from 'bun:test';

import { z } from 'zod';

import { createTestContainer } from '../../test/service-fixture.ts';
import {
  defineModule,
  defineModuleCatalog,
  defineModuleDescriptor,
  loadConfig,
  parseModuleList,
  requiredInfrastructure,
  unavailableModuleAtPath,
  type StorageAdapter,
} from '../index.ts';

const storage: StorageAdapter = {
  presignPut: async () => ({ url: 'https://storage.invalid/object', headers: {} }),
  presignGet: async () => 'https://storage.invalid/object',
  head: async () => null,
  copy: async () => {},
  delete: async () => {},
  read: async () => new ReadableStream(),
};
const label = { en: 'Fixture', de: 'Test' };
const schema = z.object({ enabled: z.boolean().default(true) }).strict();
function fixture(type: string, needsStorage = false) {
  return defineModule({
    type,
    moduleVersion: 1,
    displayName: label,
    resourceName: { singular: type, plural: `${type}s` },
    infrastructure: needsStorage ? [{ service: 'storage' }] : [],
    configSchema: schema,
    defaultConfig: () => schema.parse({}),
    scopes: [],
    events: [],
    usageMetrics: [],
    retention: { purgeExpired: async () => 0, recomputeExpiry: async () => 0 },
    privacy: {
      exportSubject: async () => [],
      deleteSubject: async () => 0,
      eraseScope: async () => 0,
    },
    publicRoutes(router) {
      router.register(
        {
          method: 'GET',
          path: '/{key}/summary',
          operationId: `${type}.summary`,
          input: z.object({
            params: z.object({ key: z.string() }),
            query: z.object({}),
            body: z.null(),
          }),
          responses: {
            200: { kind: 'json', description: 'Summary', schema: z.object({ ok: z.boolean() }) },
          },
          policy: { kind: 'public', bodyLimitBytes: 1024 },
          access: { kind: 'read' },
        },
        async () => Response.json({ ok: true }),
      );
    },
    jobs(registrar) {
      registrar.register(
        { name: `${type}.cleanup`, retries: 1, retentionSeconds: 3600 },
        z.object({}),
        async () => {},
      );
    },
  });
}
const env = {
  DATABASE_URL: 'postgres://test:test@localhost:5432/test',
  APP_SECRET: 'fixture-only-secret-with-at-least-32-characters',
};

test('every synthetic selection derives only its routes/jobs and infrastructure; core-only needs no storage', () => {
  const entries = [fixture('alpha'), fixture('beta', true), fixture('gamma')];
  const catalog = defineModuleCatalog(entries);
  for (let mask = 0; mask < 8; mask++) {
    const enabled = entries
      .filter((_entry, index) => (mask & (1 << index)) !== 0)
      .map((entry) => entry.type);
    const selected = catalog.select(enabled);
    expect(
      selected.registry.bind(createTestContainer(enabled.includes('beta') ? { storage } : {})),
    ).toBeDefined();
    expect(selected.registry.modules.map((module) => module.type)).toEqual(enabled);
    expect(selected.registry.modules.flatMap((module) => module.publicRoutes)).toHaveLength(
      enabled.length,
    );
    expect(selected.registry.modules.flatMap((module) => module.jobs)).toHaveLength(enabled.length);
    expect(requiredInfrastructure(catalog.available, enabled).has('storage')).toBe(
      enabled.includes('beta'),
    );
    for (const module of entries) {
      expect(
        unavailableModuleAtPath(selected, `/v1/public/${module.resourceName.plural}/demo/summary`),
      ).toBe(!enabled.includes(module.type));
      if (!enabled.includes(module.type))
        expect(() => selected.require(module.type)).toThrow('Module is not available');
    }
    // Environment empty means all. For an empty installation, pass an empty catalog.
    const available = enabled.length === 0 ? {} : catalog.available;
    const result = loadConfig({ ...env, BACKBRICKS_MODULES: enabled.join(',') }, available);
    expect(result.ok).toBe(!enabled.includes('beta'));
  }
  expect(parseModuleList('', Object.keys(catalog.available))).toEqual({
    modules: ['alpha', 'beta', 'gamma'],
  });
  expect(loadConfig(env, defineModuleCatalog([]).available).ok).toBe(true);
  expect(() => catalog.select(['unknown'])).toThrow('Unknown module selection');
});

test('planned descriptors are visible but never operational, and catalog snapshots resist alias changes', () => {
  const raw = {
    type: 'planned',
    displayName: { ...label },
    resourceName: { singular: 'future', plural: 'futures' },
    infrastructure: [],
  };
  const catalog = defineModuleCatalog([fixture('alpha'), raw]);
  raw.type = 'changed';
  raw.displayName.en = 'changed';
  const selection = catalog.select(['planned']);
  expect(selection.registry.modules).toHaveLength(0);
  expect(selection.metadata).toMatchInlineSnapshot(`
    {
      "modules": [
        {
          "displayName": {
            "de": "Test",
            "en": "Fixture",
          },
          "enabled": false,
          "operational": false,
          "resourceName": {
            "plural": "alphas",
            "singular": "alpha",
          },
          "type": "alpha",
        },
        {
          "displayName": {
            "de": "Test",
            "en": "Fixture",
          },
          "enabled": true,
          "operational": false,
          "resourceName": {
            "plural": "futures",
            "singular": "future",
          },
          "type": "planned",
        },
      ],
    }
  `);
  expect(() => selection.require('planned')).toThrow('Module is not available');
  expect(unavailableModuleAtPath(selection, '/v1/projects/foreign/futures/demo')).toBe(true);
  expect(unavailableModuleAtPath(selection, '/v1/projects/foreign/unknown/demo')).toBe(false);
  expect(() =>
    defineModuleCatalog([defineModuleDescriptor(raw), defineModuleDescriptor(raw)]),
  ).toThrow('type');
});
