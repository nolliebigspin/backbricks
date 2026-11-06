import { expect, test } from 'bun:test';

import * as fc from 'fast-check';

import { KEY_SCOPE_PRESETS, keyPresetSchema, keyPresetScopes, keyScopesSchema } from '../index.ts';

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
