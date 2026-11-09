import { expect, test } from 'bun:test';

import * as fc from 'fast-check';

import {
  API_KEY_ALPHABET,
  API_KEY_PREFIXES,
  API_KEY_TOKEN_LENGTH,
  apiKeyMetadata,
  createApiKeyMaterial,
  generateApiKey,
  hashApiKey,
  isApiKeyActive,
  publishableKeyTokenSchema,
  secretKeyTokenSchema,
} from '../index.ts';

const now = new Date('2026-11-06T00:00:00Z');

test('rejection sampling discards all high bytes and covers every base62 symbol evenly', () => {
  let byte = 0;
  const sequence = (bytes: Uint8Array) => {
    for (let index = 0; index < bytes.length; index++) bytes[index] = byte++ % 256;
  };
  const tokens = Array.from({ length: 8 }, () =>
    generateApiKey('secret', sequence).slice(API_KEY_PREFIXES.secret.length),
  ).join('');
  const expected = Array.from({ length: 248 }, (_, index) => index)
    .map((value) => API_KEY_ALPHABET.charAt(value % 62))
    .join('');
  // Each call consumes whole byte buffers; after 248..255 are discarded, generation continues at 0.
  expect(tokens.slice(0, 248)).toBe(expected.slice(0, 248));
  expect(tokens.slice(248)).toBe(API_KEY_ALPHABET.slice(0, 8));
  for (const symbol of API_KEY_ALPHABET)
    expect(Array.from(tokens.slice(0, 248)).filter((value) => value === symbol)).toHaveLength(4);
});

test('both key kinds have the exact protocol shape, SHA-256 known vectors and safe stored projections', async () => {
  expect(Buffer.from(await hashApiKey('abc')).toString('hex')).toBe(
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
  for (const kind of ['secret', 'publishable'] as const) {
    // oxlint-disable-next-line no-await-in-loop -- Verify each creation-only result independently.
    const material = await createApiKeyMaterial(kind);
    expect(material.credential.length).toBe(API_KEY_PREFIXES[kind].length + API_KEY_TOKEN_LENGTH);
    expect(
      (kind === 'secret' ? secretKeyTokenSchema : publishableKeyTokenSchema).safeParse(
        material.credential,
      ).success,
    ).toBe(true);
    expect(material.stored.lookupHash.byteLength).toBe(32);
    expect(material.stored.publicToken).toBe(kind === 'secret' ? null : material.credential);
    const record = {
      ...material.stored,
      id: 'key_fixture',
      organizationId: 'org_fixture',
      projectId: 'prj_fixture',
      name: 'Fixture',
      scopes: [],
      createdBy: null,
      lastUsedAt: null,
      expiresAt: null,
      revokedAt: null,
      createdAt: now,
    };
    const metadata = apiKeyMetadata(record);
    expect(Object.keys(metadata).toSorted()).toEqual(
      [
        'id',
        'kind',
        'name',
        'displayPrefix',
        'publicToken',
        'scopes',
        'createdAt',
        'lastUsedAt',
        'expiresAt',
        'revokedAt',
      ].toSorted(),
    );
    if (kind === 'secret') {
      expect(JSON.stringify(material.stored)).not.toContain(material.credential);
      expect(JSON.stringify(metadata)).not.toContain(material.credential);
      expect(
        apiKeyMetadata({ ...record, publicToken: material.credential }).publicToken,
      ).toBeNull();
    }
  }
});

test('CSPRNG keys are independently generated and malformed suffixes never match the protocol', () => {
  const keys = Array.from({ length: 100 }, () => generateApiKey('secret'));
  expect(new Set(keys).size).toBe(keys.length);
  fc.assert(
    fc.property(fc.constantFrom(...keys), fc.constantFrom('\n', '_', '-', ' ', 'é'), (key, bad) => {
      expect(secretKeyTokenSchema.safeParse(key + bad).success).toBe(false);
      expect(secretKeyTokenSchema.safeParse(key.slice(0, -1) + bad).success).toBe(false);
    }),
  );
});

test('expiry is exclusive and revocation always invalidates a credential', () => {
  expect(isApiKeyActive({ expiresAt: null, revokedAt: null }, now)).toBe(true);
  expect(isApiKeyActive({ expiresAt: now, revokedAt: null }, now)).toBe(false);
  expect(isApiKeyActive({ expiresAt: new Date(now.getTime() + 1), revokedAt: null }, now)).toBe(
    true,
  );
  expect(isApiKeyActive({ expiresAt: null, revokedAt: now }, now)).toBe(false);
});
