import { expect, test } from 'bun:test';

import * as fc from 'fast-check';
import { z } from 'zod';

import { defineModule, defineRegistry } from '../index.ts';
import { configPlanTokens, configDigest } from './plan-token.ts';
import { planConfiguration } from './planner.ts';

const name = { en: 'Fixture', de: 'Test' };
const configSchema = z.object({ enabled: z.boolean().default(true) }).strict();
const registry = defineRegistry([
  defineModule({
    type: 'fixture',
    moduleVersion: 1,
    displayName: name,
    resourceName: { singular: 'fixture', plural: 'fixtures' },
    infrastructure: [],
    configSchema,
    defaultConfig: () => configSchema.parse({}),
    scopes: [],
    events: [],
    usageMetrics: [],
    retention: { purgeExpired: async () => 0, recomputeExpiry: async () => 0 },
    privacy: { exportSubject: async () => [], deleteSubject: async () => 0 },
  }),
]);
const project = 'prj_01m6r74k53e978tx66drg3tsg5';

test('planning is deterministic under key order and normalized equivalents', () => {
  fc.assert(
    fc.property(
      fc.uniqueArray(fc.stringMatching(/^[a-z][a-z0-9]{0,12}$/), { maxLength: 20 }),
      (keys) => {
        const entries = keys.map((key) => [key, { name: key, moduleVersion: 1, config: {} }]);
        const a = planConfiguration(
          registry,
          { project, modules: { fixtures: Object.fromEntries(entries) } },
          [],
        );
        const b = planConfiguration(
          registry,
          { project, modules: { fixtures: Object.fromEntries(entries.toReversed()) } },
          [],
        );
        expect(a).toEqual(b);
        expect(
          a.operations.every((operation) => operation.kind === 'create' && !operation.destructive),
        ).toBe(true);
      },
    ),
  );
});

test('plan signatures reject tampering, expiry, changed bindings and wrong secrets', () => {
  const tokens = configPlanTokens('fixture-secret');
  const digest = configDigest({ organization: 'a', desired: {} });
  const token = tokens.issue(digest, 1000);
  expect(() => tokens.verify(token, digest, 999)).not.toThrow();
  expect(() => tokens.verify(token, digest, 1000)).toThrow();
  expect(() => tokens.verify(`${token}0`, digest, 999)).toThrow();
  expect(() =>
    tokens.verify(token, configDigest({ organization: 'b', desired: {} }), 999),
  ).toThrow();
  expect(() => configPlanTokens('other-secret').verify(token, digest, 999)).toThrow();
});
