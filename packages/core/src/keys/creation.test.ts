import { expect, test } from 'bun:test';

import { apiKeyCreateSchema } from '../index.ts';

test('key issuance schema requires one explicit grant source and expiry choice', () => {
  const schema = apiKeyCreateSchema(['forms']);
  const base = { kind: 'secret', name: ' Server ', expiresAt: null } as const;
  expect(schema.parse({ ...base, preset: 'agent' })).toEqual({
    ...base,
    name: 'Server',
    preset: 'agent',
  });
  expect(schema.parse({ ...base, scopes: ['stats:read', 'stats:read'] })).toEqual({
    ...base,
    name: 'Server',
    scopes: ['stats:read'],
  });
  for (const value of [
    base,
    { ...base, preset: 'agent', scopes: ['stats:read'] },
    { ...base, scopes: [] },
    { ...base, preset: 'agent', expiresAt: undefined },
    { ...base, preset: 'agent', name: 'bb_sk_do_not_use_a_credential_as_label' },
  ])
    expect(schema.safeParse(value).success).toBe(false);
});
