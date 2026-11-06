import { expect, test } from 'bun:test';

import {
  createApiKeyMaterial,
  createIds,
  secretKeyReferenceSchema,
  systemClock,
  type ApiKeyRecord,
} from '@backbricks/core';

import { createTenantFixture } from '../test/tenant-fixtures.ts';
import { postgresAvailable } from '../test/test-database.ts';
import { createPublishableKeyLookup, createSecretKeyLookup } from './index.ts';
import { createWithTenant } from './with-tenant.ts';

const available = await postgresAvailable();
test.skipIf(!available)(
  'credential bootstrap fixes key kind, returns IDs only and rejects nonexact/inactive keys and projects',
  async () => {
    const fixture = await createTenantFixture();
    try {
      const db = fixture.handle.db;
      const now = systemClock.now();
      const expiry = new Date(now.getTime() + 1000);
      const ids = createIds(systemClock);
      const withTenant = createWithTenant(db);
      const context = { organizationId: 'org-a', projectId: fixture.projectIds.a1 };
      async function insert(kind: ApiKeyRecord['kind'], expiresAt: Date | null = null) {
        const material = await createApiKeyMaterial(kind);
        const key = await withTenant(context, ({ repositories }) =>
          repositories.keys.insert({
            ...material.stored,
            id: ids.generate('key'),
            name: 'Fixture',
            scopes: kind === 'secret' ? ['integration:read'] : [],
            createdBy: null,
            createdAt: now,
            lastUsedAt: null,
            expiresAt,
            revokedAt: null,
          }),
        );
        return { key, hash: material.stored.lookupHash };
      }
      const pub = await insert('publishable');
      const secret = await insert('secret');
      const expiring = await insert('publishable', expiry);
      const reference = (key: ApiKeyRecord) =>
        secretKeyReferenceSchema.parse({ id: key.id, ...context });
      const lookup = createPublishableKeyLookup(db);
      const lookupSecret = createSecretKeyLookup(db);
      expect(await lookup(pub.hash, now)).toEqual(reference(pub.key));
      expect(await lookupSecret(secret.hash, now)).toEqual(reference(secret.key));
      expect(await lookup(secret.hash, now)).toBeNull();
      expect(await lookupSecret(pub.hash, now)).toBeNull();
      expect(await lookup(new Uint8Array(31), now)).toBeNull();
      const changed = new Uint8Array(pub.hash);
      changed[0] = (changed[0] ?? 0) ^ 1;
      expect(await lookup(changed, now)).toBeNull();
      expect(await lookup(expiring.hash, now)).toEqual(reference(expiring.key));
      expect(await lookup(expiring.hash, expiry)).toBeNull();
      await withTenant(context, ({ repositories }) => repositories.keys.revoke(pub.key.id, now));
      expect(await lookup(pub.hash, now)).toBeNull();
      await withTenant({ organizationId: context.organizationId }, ({ repositories }) =>
        repositories.projects.update(context.projectId, { deletedAt: now }),
      );
      expect(await lookup(expiring.hash, now)).toBeNull();
      expect(await lookupSecret(secret.hash, now)).toBeNull();
    } finally {
      await fixture.handle.close();
      await fixture.database.drop();
    }
  },
);
