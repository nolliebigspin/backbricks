import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { createIds, systemClock } from '@backbricks/core';

import { createTenantFixture } from '../test/tenant-fixtures.ts';
import { postgresAvailable } from '../test/test-database.ts';
import { createWithTenant } from './with-tenant.ts';

const available = await postgresAvailable();
const ids = createIds(systemClock);
const now = systemClock.now();
const future = new Date('9999-01-01T00:00:00Z');

describe.skipIf(!available)('tenant repositories (real Postgres)', () => {
  let fixture: Awaited<ReturnType<typeof createTenantFixture>>;
  beforeAll(async () => {
    fixture = await createTenantFixture();
  });
  afterAll(async () => {
    await fixture.handle.close();
    await fixture.database.drop();
  });

  test('all core repositories isolate project and organization records', async () => {
    const withTenant = createWithTenant(fixture.handle.db);
    const owner = { organizationId: 'org-a', projectId: fixture.projectIds.a1 };
    const keyId = ids.generate('key');
    const instanceId = ids.generate('mod');
    const eventId = ids.generate('evt');
    await withTenant(owner, async ({ repositories: repo }) => {
      await repo.keys.insert({
        id: keyId,
        kind: 'secret',
        name: 'Fixture',
        lookupHash: new Uint8Array(32),
        displayPrefix: 'bb_sk_fixture',
        publicToken: null,
        scopes: [],
        createdBy: null,
        lastUsedAt: null,
        expiresAt: null,
        revokedAt: null,
        createdAt: now,
      });
      await repo.instances.insert({
        id: instanceId,
        moduleType: 'fixture',
        key: 'example',
        name: 'Example',
        status: 'active',
        config: {},
        configVersion: 1,
        moduleVersion: 1,
        createdAt: now,
        updatedAt: now,
      });
      await repo.revisions.insert({
        id: ids.generate('rvn'),
        instanceId,
        configVersion: 1,
        moduleVersion: 1,
        config: {},
        actorType: 'system',
        actorId: null,
        createdAt: now,
      });
      await repo.audit.insert({
        id: ids.generate('aud'),
        actorType: 'system',
        actorId: null,
        action: 'fixture.created',
        targetType: 'instance',
        targetId: instanceId,
        changes: null,
        ipHash: null,
        requestId: null,
        createdAt: now,
        expiresAt: future,
      });
      await repo.events.insert({
        id: eventId,
        type: 'fixture.created',
        subjectType: 'instance',
        subjectId: instanceId,
        payload: {},
        createdAt: now,
        dispatchedAt: null,
        expiresAt: future,
      });
      await repo.usage.increment('fixture.count', '2026-01-01', 1n);
      expect(
        await repo.idempotency.insert({
          key: 'fixture-request',
          requestHash: new Uint8Array(32),
          responseStatus: 200,
          responseBody: { id: instanceId },
          createdAt: now,
          expiresAt: future,
        }),
      ).toBe(true);
      expect((await repo.keys.get(keyId)).organizationId).toBe('org-a');
      expect((await repo.instances.getByKey('fixture', 'example')).id).toBe(instanceId);
      expect(await repo.revisions.list(instanceId, { limit: 10 })).toHaveLength(1);
      expect(await repo.audit.list({ limit: 10 })).toHaveLength(1);
      expect(await repo.events.pending(10)).toHaveLength(1);
      expect(await repo.usage.list('2026-01-01')).toEqual([{ metric: 'fixture.count', value: 1n }]);
      expect((await repo.idempotency.get('fixture-request', now))?.responseBody).toEqual({
        id: instanceId,
      });
    });
    await Promise.all(
      [
        { organizationId: 'org-a', projectId: fixture.projectIds.a2 },
        { organizationId: 'org-b', projectId: fixture.projectIds.b1 },
      ].map((context) =>
        withTenant(context, async ({ repositories: repo }) => {
          expect(await repo.keys.get(keyId).catch((error: unknown) => error)).toMatchObject({
            code: 'not_found',
          });
          expect(
            await repo.instances.get(instanceId).catch((error: unknown) => error),
          ).toMatchObject({ code: 'not_found' });
          expect(
            await repo.revisions.get(instanceId, 1).catch((error: unknown) => error),
          ).toMatchObject({ code: 'not_found' });
          expect(
            await repo.events.markDispatched(eventId, now).catch((error: unknown) => error),
          ).toMatchObject({ code: 'not_found' });
          expect(await repo.keys.list({ limit: 10 })).toEqual([]);
          expect(await repo.instances.list({ limit: 10 })).toEqual([]);
          expect(await repo.audit.list({ limit: 10 })).toEqual([]);
          expect(await repo.events.pending(10)).toEqual([]);
          expect(await repo.usage.list('2026-01-01')).toEqual([]);
          expect(await repo.idempotency.get('fixture-request', now)).toBeNull();
        }),
      ),
    );
  });

  test('project inserts stamp scope and updates reject tenant reassignment', async () => {
    const withTenant = createWithTenant(fixture.handle.db);
    const id = ids.generate('prj');
    await withTenant({ organizationId: 'org-a' }, async ({ repositories: repo }) => {
      const input = Object.assign(
        {
          id,
          name: 'Scoped',
          slug: 'scoped',
          allowedOrigins: [],
          settings: {},
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        },
        { organizationId: 'org-b' },
      );
      expect((await repo.projects.insert(input)).organizationId).toBe('org-a');
      const update = Object.assign({ name: 'Moved' }, { organizationId: 'org-b' });
      const failure = await repo.projects.update(id, update).catch((error: unknown) => error);
      expect(failure).toMatchObject({ name: 'ZodError' });
      expect((await repo.projects.get(id)).organizationId).toBe('org-a');
    });
  });

  test('keyset pages are bounded and remain within the authorized organization', async () => {
    const withTenant = createWithTenant(fixture.handle.db);
    await withTenant({ organizationId: 'org-b' }, async ({ repositories: repo }) => {
      const first = (await repo.projects.list({ limit: 1 }))[0];
      if (!first) throw new Error('Expected first project');
      const next = await repo.projects.list({
        limit: 1,
        before: { createdAt: first.createdAt, id: first.id },
      });
      expect(next).toHaveLength(1);
      expect(next[0]?.id).not.toBe(first.id);
      expect(next[0]?.organizationId).toBe('org-b');
      expect(
        await repo.projects.list({ limit: 101 }).catch((error: unknown) => error),
      ).toMatchObject({ message: 'Repository pages must contain between 1 and 100 records.' });
    });
  });
});
