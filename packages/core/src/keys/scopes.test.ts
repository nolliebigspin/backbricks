import { expect, test } from 'bun:test';

import * as fc from 'fast-check';

import {
  KEY_SCOPE_PRESETS,
  MAX_KEY_SCOPES,
  createKeyScopeCatalog,
  keyPresetSchema,
  keyPresetScopes,
  keyScopesSchema,
} from '../index.ts';

const modules = ['forms', 'uploads', 'reviews'];

test('agent preset excludes personal, destructive, deletion and project/key administration rights', () => {
  expect(keyPresetScopes('agent', modules)).toEqual([
    'config:read',
    'config:write',
    'integration:read',
    'stats:read',
    'test:write',
  ]);
  expect(KEY_SCOPE_PRESETS.agent).not.toContain('config:destructive');
  for (const name of ['data:read', 'data:write', 'data:delete', 'project:write', 'keys:create'])
    expect(KEY_SCOPE_PRESETS.agent).not.toContain(name);
  expect(keyPresetSchema.safeParse('unknown').success).toBe(false);
});

test('module subsets produce only enabled grants; explicit disabled/unknown rights fail instead of being ignored', () => {
  fc.assert(
    fc.property(fc.subarray(modules), (enabled) => {
      const schema = keyScopesSchema(enabled);
      const scopes = keyPresetScopes('server_integration', enabled);
      expect(schema.parse(scopes)).toEqual(scopes);
      expect(scopes).toHaveLength(enabled.length);
      for (const scope of ['forms:submit', 'uploads:create', 'reviews:submit']) {
        const module = scope.split(':')[0]!;
        expect(schema.safeParse([scope]).success).toBe(enabled.includes(module));
      }
    }),
  );
  for (const name of ['keys:create', 'unknown:read', 'forms:*', 'bb_sk_secret:read'])
    expect(keyScopesSchema(modules).safeParse([name]).success).toBe(false);
  expect(keyScopesSchema(modules).parse(['stats:read', 'config:read', 'stats:read'])).toEqual([
    'config:read',
    'stats:read',
  ]);
  const mutable = ['forms'];
  const snapshot = keyScopesSchema(mutable);
  mutable.push('uploads');
  expect(snapshot.safeParse(['uploads:create']).success).toBe(false);
});

test('selected module scopes share issuance/auth catalog without broadening presets or mutable aliases', () => {
  const declared = { name: 'counter:read', module: 'counter' };
  const catalog = createKeyScopeCatalog([declared, { name: 'forms:submit', module: 'forms' }]);
  const schema = keyScopesSchema(['counter'], catalog);
  declared.module = 'other';
  expect(schema.parse(['counter:read'])).toEqual(['counter:read']);
  expect(keyScopesSchema([], catalog).safeParse(['counter:read']).success).toBe(false);
  expect(keyScopesSchema(['counter'], catalog).safeParse(['counter:delete']).success).toBe(false);
  expect(keyPresetScopes('agent', ['counter'])).not.toContain('counter:read');
  expect(keyPresetScopes('server_integration', ['counter'])).toEqual([]);
  expect(() => createKeyScopeCatalog([{ name: 'project:write', module: 'project' }])).toThrow(
    'ownership',
  );
  expect(() => createKeyScopeCatalog([{ name: 'forms:submit', module: 'counter' }])).toThrow(
    'ownership',
  );
  const mutable = [{ name: 'counter:read', module: 'counter' }];
  const snapshot = keyScopesSchema([], mutable);
  mutable[0]!.module = 'other';
  expect(snapshot.safeParse(['counter:read']).success).toBe(false);
});

test('expanded scope catalogs cannot exceed the audit-safe grant bound', () => {
  const catalog = createKeyScopeCatalog(
    Array.from({ length: MAX_KEY_SCOPES + 1 }, (_value, index) => ({
      name: `counter:read_${index}`,
      module: 'counter',
    })),
  );
  const scopes = catalog.filter((entry) => entry.module === 'counter').map((entry) => entry.name);
  expect(keyScopesSchema(['counter'], catalog).safeParse(scopes).success).toBe(false);
  expect(
    keyScopesSchema(['counter'], catalog).safeParse(scopes.slice(0, MAX_KEY_SCOPES)).success,
  ).toBe(true);
});
