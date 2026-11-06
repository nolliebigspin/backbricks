import { describe, expect, test } from 'bun:test';

import { DEFAULT_BODY_LIMIT_BYTES, routePolicySchema } from './route-policy.ts';

describe('route policy', () => {
  test('management operations cannot omit access rules or isolation coverage', () => {
    const management = { kind: 'management', bodyLimitBytes: 1024, isolationCase: 'project' };
    expect(routePolicySchema.safeParse(management).success).toBe(false);
    expect(
      routePolicySchema.safeParse({ ...management, session: { role: 'member' } }).success,
    ).toBe(true);
    expect(
      routePolicySchema.safeParse({ ...management, secretKey: { scope: 'config:read' } }).success,
    ).toBe(true);
    expect(
      routePolicySchema.safeParse({ ...management, session: { role: 'superuser' } }).success,
    ).toBe(false);
    expect(
      routePolicySchema.safeParse({ ...management, isolationCase: '', session: { role: 'owner' } })
        .success,
    ).toBe(false);
  });

  test('body limits are explicit, positive integers below the global ceiling', () => {
    for (const limit of [undefined, 0, -1, 1.5, DEFAULT_BODY_LIMIT_BYTES + 1]) {
      expect(routePolicySchema.safeParse({ kind: 'public', bodyLimitBytes: limit }).success).toBe(
        false,
      );
    }
    expect(
      routePolicySchema.safeParse({ kind: 'public', bodyLimitBytes: DEFAULT_BODY_LIMIT_BYTES })
        .success,
    ).toBe(true);
  });

  test('a public declaration cannot disguise management permissions', () => {
    expect(
      routePolicySchema.safeParse({
        kind: 'public',
        bodyLimitBytes: 1024,
        session: { role: 'owner' },
      }).success,
    ).toBe(false);
  });
});
