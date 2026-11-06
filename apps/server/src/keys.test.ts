import { expect, test } from 'bun:test';

import {
  apiKeyCreationResponseSchema,
  apiKeyMetadataSchema,
  hashApiKey,
  secretKeyIdentitySchema,
  type SecretKeyIdentity,
  systemClock,
} from '@backbricks/core';
import { createWithTenant } from '@backbricks/db';
import { z } from '@hono/zod-openapi';

import { available, scenario } from '../test/auth-fixture.ts';
import { prepareIsolationFixture } from '../test/isolation/setup.ts';

const listSchema = z.object({
  data: z.array(apiKeyMetadataSchema),
  nextCursor: z.string().nullable(),
});

test.skipIf(!available)(
  'key management reveals once, preserves public tokens, enforces grants/roles and serializes revocation',
  async () => {
    let token: string | undefined;
    let identity: SecretKeyIdentity | undefined;
    await scenario(
      async (base) => {
        const f = await prepareIsolationFixture(base);
        const path = `/v1/projects/${f.a1.id}/keys`;
        const body = {
          kind: 'secret',
          name: 'Private key label',
          preset: 'agent',
          expiresAt: null,
        };
        const created = await f.request(path, body, f.owner.cookie);
        expect(created.status).toBe(201);
        expect(created.headers.get('cache-control')).toBe('no-store');
        const secret = apiKeyCreationResponseSchema.parse(await created.json());
        token = secret.token;
        identity = secretKeyIdentitySchema.parse({
          id: secret.id,
          organizationId: f.organizationId,
          projectId: f.a1.id,
          scopes: secret.scopes,
        });
        expect(secret.publicToken).toBeNull();
        const withTenant = createWithTenant(f.db);
        const context = { organizationId: f.organizationId, projectId: f.a1.id };
        const stored = await withTenant(context, ({ repositories }) =>
          repositories.keys.get(secret.id),
        );
        expect(Buffer.from(stored.lookupHash).equals(Buffer.from(await hashApiKey(token)))).toBe(
          true,
        );
        expect(stored.publicToken).toBeNull();
        expect(JSON.stringify(stored)).not.toContain(token);
        const published = await f.request(
          path,
          { kind: 'publishable', name: 'Website public key', expiresAt: null },
          f.admin.cookie,
        );
        expect(published.status).toBe(201);
        const publicKey = apiKeyCreationResponseSchema.parse(await published.json());
        expect(publicKey.publicToken).toBe(publicKey.token);
        expect(publicKey.scopes).toEqual([]);
        const listing = await f.request(path, undefined, f.owner.cookie);
        expect(listing.headers.get('cache-control')).toBe('no-store');
        const text = await listing.text();
        const keys = listSchema.parse(JSON.parse(text));
        expect(keys.data).toHaveLength(2);
        expect(text).not.toContain(token);
        expect(text).not.toContain('lookupHash');
        expect(text).toContain(publicKey.token);
        expect(keys.data.every((key) => !Object.hasOwn(key, 'token'))).toBe(true);
        const page = listSchema.parse(
          await (await f.request(`${path}?limit=1`, undefined, f.owner.cookie)).json(),
        );
        expect(page.data).toHaveLength(1);
        expect(page.nextCursor).toBeString();
        const last = listSchema.parse(
          await (
            await f.request(`${path}?limit=1&cursor=${page.nextCursor}`, undefined, f.owner.cookie)
          ).json(),
        );
        expect(last.data).toHaveLength(1);
        expect(last.data[0]?.id).not.toBe(page.data[0]?.id);
        expect(last.nextCursor).toBeNull();
        expect((await f.request(path, undefined, f.member.cookie)).status).toBe(403);
        expect((await f.request(path, body, f.member.cookie)).status).toBe(403);
        const bearer = { authorization: `Bearer ${token}` };
        expect((await f.request(path, undefined, f.owner.cookie, bearer)).status).toBe(403);
        expect((await f.request(path, body, f.owner.cookie, bearer)).status).toBe(403);
        expect(
          (await f.request(`${path}/${secret.id}`, undefined, f.owner.cookie, bearer, 'DELETE'))
            .status,
        ).toBe(403);
        const invalid = [
          { kind: 'secret', name: 'Missing explicit expiry', preset: 'agent' },
          { ...body, preset: undefined },
          { ...body, scopes: ['data:read'] },
          { ...body, preset: undefined, scopes: [] },
          { ...body, preset: undefined, scopes: ['unknown:read'] },
          { ...body, preset: undefined, scopes: ['uploads:create'] },
          { ...body, expiresAt: new Date(systemClock.now().getTime() - 1).toISOString() },
          { ...body, createdBy: f.other.id },
          { ...body, lookupHash: 'forged' },
          { kind: 'publishable', name: 'No secret rights', scopes: ['data:read'], expiresAt: null },
        ];
        const rejected = await Promise.all(
          invalid.map((input) => f.request(path, input, f.owner.cookie)),
        );
        expect(rejected.every((response) => response.status === 422)).toBe(true);
        const responses = await Promise.all([
          f.request(`${path}/${secret.id}`, undefined, f.owner.cookie, undefined, 'DELETE'),
          f.request(`${path}/${secret.id}`, undefined, f.admin.cookie, undefined, 'DELETE'),
        ]);
        expect(responses.map((response) => response.status)).toEqual([204, 204]);
        const activity = () =>
          withTenant(context, async ({ repositories }) => ({
            key: await repositories.keys.get(secret.id),
            audit: await repositories.audit.list({ limit: 100 }),
            events: await repositories.events.pending(100),
          }));
        const state = await activity();
        expect(state.key.revokedAt).toBeInstanceOf(Date);
        expect(state.audit.filter((entry) => entry.action === 'key.revoked')).toHaveLength(1);
        expect(state.events.filter((entry) => entry.type === 'key.revoked')).toHaveLength(1);
        expect(
          (await f.request(`${path}/${secret.id}`, undefined, f.owner.cookie, undefined, 'DELETE'))
            .status,
        ).toBe(204);
        expect(await activity()).toEqual(state);
        expect(JSON.stringify(state.audit)).not.toContain(token);
        expect(JSON.stringify(state.events)).not.toContain(token);
        expect(JSON.stringify(state.audit)).not.toContain('Private key label');
        expect(f.logs.join('')).not.toContain(token);
        const document = await f.request('/v1/openapi.json');
        expect(document.status).toBe(200);
        expect(await document.text()).toContain('createKey');
      },
      {},
      { resolveKey: async (credential) => (credential === token && identity ? identity : null) },
    );
  },
  20_000,
);

test.skipIf(!available)(
  'key creation/revocation roll back rows and activity when either audit or outbox fails',
  async () => {
    await scenario(async (base) => {
      const f = await prepareIsolationFixture(base);
      const path = `/v1/projects/${f.a1.id}/keys`;
      const body = {
        kind: 'secret',
        name: 'Rollback fixture',
        scopes: ['stats:read'],
        expiresAt: null,
      };
      const key = apiKeyCreationResponseSchema.parse(
        await (await f.request(path, body, f.owner.cookie)).json(),
      );
      for (const table of ['audit_logs', 'events']) {
        const column = table === 'audit_logs' ? 'action' : 'type';
        // oxlint-disable-next-line no-await-in-loop -- Fixed disposable-database constraints isolate each provider failure.
        await f.db.execute(
          `alter table ${table} add constraint fixture_key_failure check (${column} not in ('key.created', 'key.revoked')) not valid`,
        );
        for (const operation of [
          { path, body, method: 'POST' },
          { path: `${path}/${key.id}`, body: undefined, method: 'DELETE' },
        ]) {
          // oxlint-disable-next-line no-await-in-loop -- Snapshot every mutation independently.
          const before = await f.snapshot();
          // oxlint-disable-next-line no-await-in-loop -- Verify response only after the real transaction resolves.
          const response = await f.request(
            operation.path,
            operation.body,
            f.owner.cookie,
            undefined,
            operation.method,
          );
          expect(response.status).toBe(500);
          // oxlint-disable-next-line no-await-in-loop -- No failed transaction may leave business or activity writes.
          expect(await f.snapshot()).toEqual(before);
        }
        // oxlint-disable-next-line no-await-in-loop -- Drop only the current test constraint after all failed writes.
        await f.db.execute(`alter table ${table} drop constraint fixture_key_failure`);
      }
    });
  },
  20_000,
);
