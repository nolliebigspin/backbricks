import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';

import { API_KEY_PREFIXES, API_KEY_TOKEN_LENGTH, type SecretKeyIdentity } from '@backbricks/core';
import { createWithTenant } from '@backbricks/db';

import { available, scenario } from '../test/auth-fixture.ts';
import { prepareIsolationFixture } from '../test/isolation/setup.ts';
import { insertKeyFixture } from '../test/management-fixture.ts';

test.skipIf(!available)(
  'project-bound key policies allow declared operations and archive immediately closes project access',
  async () => {
    const directory = new Map<string, SecretKeyIdentity>();
    const token = `${API_KEY_PREFIXES.secret}${'A'.repeat(API_KEY_TOKEN_LENGTH)}`;
    const readToken = `${API_KEY_PREFIXES.secret}${'B'.repeat(API_KEY_TOKEN_LENGTH)}`;
    await scenario(
      async (base) => {
        const f = await prepareIsolationFixture(base);
        const key = await insertKeyFixture(
          f.db,
          f.a1,
          createHash('sha256').update(token).digest(),
          ['project:write', 'integration:read'],
        );
        directory.set(token, key);
        directory.set(
          readToken,
          await insertKeyFixture(f.db, f.a1, createHash('sha256').update(readToken).digest(), [
            'integration:read',
          ]),
        );
        const headers = { authorization: `Bearer ${token}` };
        const path = `/v1/projects/${f.a1.id}`;
        expect((await f.request(path, undefined, undefined, headers)).status).toBe(200);
        expect(
          (await f.request(path, { name: 'Key changed' }, undefined, headers, 'PATCH')).status,
        ).toBe(200);
        expect(
          (
            await f.request(
              path,
              { name: 'Denied' },
              f.owner.cookie,
              { authorization: `Bearer ${readToken}` },
              'PATCH',
            )
          ).status,
        ).toBe(403);
        expect((await f.request('/v1/projects', undefined, f.owner.cookie, headers)).status).toBe(
          403,
        );
        expect(
          (
            await f.request(
              '/v1/projects',
              { name: 'Denied', slug: 'denied' },
              f.owner.cookie,
              headers,
            )
          ).status,
        ).toBe(403);
        expect((await f.request(path, undefined, f.owner.cookie, headers, 'DELETE')).status).toBe(
          403,
        );
        expect(
          (await f.request(`/v1/projects/${f.a2.id}`, undefined, f.owner.cookie, headers)).status,
        ).toBe(404);
        expect(
          (await f.request(`/v1/projects/${f.b1.id}`, undefined, f.owner.cookie, headers)).status,
        ).toBe(404);
        expect((await f.request(path, undefined, f.admin.cookie, undefined, 'DELETE')).status).toBe(
          204,
        );
        expect((await f.request(path, undefined, f.owner.cookie, headers)).status).toBe(404);
        expect(
          (await f.request(path, { name: 'Denied archived' }, undefined, headers, 'PATCH')).status,
        ).toBe(404);
        expect((await f.request(path, undefined, f.owner.cookie)).status).toBe(404);
        expect((await f.request(path, undefined, f.admin.cookie, undefined, 'DELETE')).status).toBe(
          404,
        );
        expect((await f.request(`/v1/projects/${f.a2.id}`, undefined, f.owner.cookie)).status).toBe(
          200,
        );
        const history = await createWithTenant(f.db)(
          { organizationId: f.organizationId },
          async ({ repositories }) => ({
            project: await repositories.projects.get(f.a1.id, { includeArchived: true }),
            audit: await repositories.audit.list({ limit: 100 }),
            events: await repositories.events.pending(100),
          }),
        );
        expect(history.project.deletedAt).toBeInstanceOf(Date);
        expect(history.audit.find((entry) => entry.action === 'project.updated')).toMatchObject({
          actorType: 'api_key',
          actorId: key.id,
          projectId: f.a1.id,
        });
        expect(history.audit.find((entry) => entry.action === 'project.archived')).toMatchObject({
          actorType: 'user',
          actorId: f.admin.id,
          projectId: f.a1.id,
        });
        expect(history.events.some((event) => event.type === 'project.archived')).toBe(true);
        expect(JSON.stringify(history)).not.toContain(token);
        expect(f.logs.join('')).not.toContain(token);
      },
      {},
      {
        // Test-only credential discovery. Production hashing/revocation/exposure auditing is P1.4c.
        resolveKey: async (credential) => directory.get(credential) ?? null,
      },
    );
  },
  20_000,
);
