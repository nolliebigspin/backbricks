import { afterAll, beforeAll, expect, test } from 'bun:test';

import { apiKeyMetadata, createApiKeyMaterial, createIds, systemClock } from '@backbricks/core';

import { createTenantFixture } from '../test/tenant-fixtures.ts';
import { postgresAvailable } from '../test/test-database.ts';
import { createWithTenant } from './with-tenant.ts';

const available = await postgresAvailable();
let fixture: Awaited<ReturnType<typeof createTenantFixture>>;
beforeAll(async () => {
  if (available) fixture = await createTenantFixture();
});
afterAll(async () => {
  if (fixture) {
    await fixture.handle.close();
    await fixture.database.drop();
  }
});

test.skipIf(!available)(
  'key material persists hashes, scopes active lookup by tenant, and excludes expired/revoked/archived keys',
  async () => {
    const now = systemClock.now();
    const expiresAt = new Date(now.getTime() + 1000);
    const ids = createIds(systemClock);
    const material = await createApiKeyMaterial('secret');
    const withTenant = createWithTenant(fixture.handle.db);
    const context = { organizationId: 'org-a', projectId: fixture.projectIds.a1 };
    const key = await withTenant(context, ({ repositories }) =>
      repositories.keys.insert({
        ...material.stored,
        id: ids.generate('key'),
        name: 'Fixture',
        scopes: ['stats:read'],
        createdBy: null,
        createdAt: now,
        lastUsedAt: null,
        expiresAt,
        revokedAt: null,
      }),
    );
    expect(Buffer.from(key.lookupHash).equals(Buffer.from(material.stored.lookupHash))).toBe(true);
    expect(key.publicToken).toBeNull();
    expect(JSON.stringify(key)).not.toContain(material.credential);
    expect(JSON.stringify(apiKeyMetadata(key))).not.toContain(material.credential);
    expect(
      (
        await withTenant(context, ({ repositories }) =>
          repositories.keys.findByHash(material.stored.lookupHash, now),
        )
      )?.id,
    ).toBe(key.id);
    expect(
      await withTenant(context, ({ repositories }) =>
        repositories.keys.findByHash(material.stored.lookupHash, expiresAt),
      ),
    ).toBeNull();
    expect(
      await withTenant(
        { organizationId: 'org-b', projectId: fixture.projectIds.b1 },
        ({ repositories }) => repositories.keys.findByHash(material.stored.lookupHash, now),
      ),
    ).toBeNull();
    await withTenant(context, ({ repositories }) => repositories.keys.revoke(key.id, now));
    expect(
      await withTenant(context, ({ repositories }) =>
        repositories.keys.findByHash(material.stored.lookupHash, now),
      ),
    ).toBeNull();
    await withTenant({ organizationId: 'org-a' }, ({ repositories }) =>
      repositories.projects.update(context.projectId, { deletedAt: now }),
    );
    const failure = await withTenant(context, ({ repositories }) =>
      repositories.keys.findByHash(material.stored.lookupHash, now),
    ).catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: 'not_found' });
  },
);
