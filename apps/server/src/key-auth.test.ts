import { expect, test } from 'bun:test';

import {
  apiKeyCreationResponseSchema,
  API_KEY_PREFIXES,
  API_KEY_TOKEN_LENGTH,
  hashApiKey,
  ORGANIZATION_SELECTION_HEADER,
  systemClock,
  secretKeyReferenceSchema,
} from '@backbricks/core';
import { createWithTenant, createSecretKeyLookup } from '@backbricks/db';

import { available, scenario } from '../test/auth-fixture.ts';
import { prepareIsolationFixture } from '../test/isolation/setup.ts';
import { insertKeyFixture } from '../test/management-fixture.ts';

test.skipIf(!available)(
  'production key lookup enforces validity/scopes/tenant binding and throttles concurrent last-used writes',
  async () => {
    const started = systemClock.now().getTime() + 1000;
    let time = started;
    await scenario(
      async (base) => {
        const f = await prepareIsolationFixture(base);
        const withTenant = createWithTenant(f.db);
        const context = { organizationId: f.organizationId, projectId: f.a1.id };
        const path = `/v1/projects/${f.a1.id}`;
        const create = async (scopes: string[], expiresAt: string | null = null) =>
          apiKeyCreationResponseSchema.parse(
            await (
              await f.request(
                `${path}/keys`,
                { kind: 'secret', name: 'Production fixture', scopes, expiresAt },
                f.owner.cookie,
              )
            ).json(),
          );
        const key = await create(
          ['integration:read', 'project:write'],
          new Date(started + 3_600_000).toISOString(),
        );
        const lookup = createSecretKeyLookup(f.db);
        expect(await lookup(await hashApiKey(key.token), new Date(time))).toEqual(
          secretKeyReferenceSchema.parse({
            id: key.id,
            organizationId: f.organizationId,
            projectId: f.a1.id,
          }),
        );
        expect(await lookup(new Uint8Array(31), new Date(time))).toBeNull();
        const headers = { authorization: `Bearer ${key.token}` };
        const get = () => f.request(path, undefined, undefined, headers);
        expect((await get()).status).toBe(200);
        expect((await f.request(path, undefined, f.other.cookie, headers)).status).toBe(200);
        expect(
          (await f.request(`/v1/projects/${f.a2.id}`, undefined, undefined, headers)).status,
        ).toBe(404);
        expect(
          (await f.request(`/v1/projects/${f.b1.id}`, undefined, undefined, headers)).status,
        ).toBe(404);
        expect(
          (
            await f.request(path, undefined, undefined, {
              ...headers,
              [ORGANIZATION_SELECTION_HEADER]: f.foreignId,
            })
          ).status,
        ).toBe(404);
        expect((await f.request('/v1/projects', undefined, f.owner.cookie, headers)).status).toBe(
          403,
        );
        expect((await f.request(`${path}/keys`, undefined, f.owner.cookie, headers)).status).toBe(
          403,
        );
        expect(
          (await f.request(path, { name: 'Key edit' }, undefined, headers, 'PATCH')).status,
        ).toBe(200);
        const stored = () =>
          withTenant(context, ({ repositories }) => repositories.keys.get(key.id));
        expect((await stored()).lastUsedAt?.getTime()).toBe(started);
        time += 30_000;
        const concurrent = await Promise.all(Array.from({ length: 20 }, get));
        expect(concurrent.every((response) => response.status === 200)).toBe(true);
        expect((await stored()).lastUsedAt?.getTime()).toBe(started);
        time = started + 60_000;
        expect((await get()).status).toBe(200);
        expect((await stored()).lastUsedAt?.getTime()).toBe(time);
        const readOnly = await create(['integration:read']);
        expect(
          (
            await f.request(
              path,
              { name: 'Denied' },
              f.owner.cookie,
              { authorization: `Bearer ${readOnly.token}` },
              'PATCH',
            )
          ).status,
        ).toBe(403);
        const unknown = `${API_KEY_PREFIXES.secret}${'Z'.repeat(API_KEY_TOKEN_LENGTH)}`;
        expect(
          (await f.request(path, undefined, f.owner.cookie, { authorization: `Bearer ${unknown}` }))
            .status,
        ).toBe(401);
        const publicKey = apiKeyCreationResponseSchema.parse(
          await (
            await f.request(
              `${path}/keys`,
              { kind: 'publishable', name: 'Public', expiresAt: null },
              f.owner.cookie,
            )
          ).json(),
        );
        expect(
          (
            await f.request(path, undefined, f.owner.cookie, {
              authorization: `Bearer ${publicKey.token}`,
            })
          ).status,
        ).toBe(403);
        const disabled = `${API_KEY_PREFIXES.secret}${'Y'.repeat(API_KEY_TOKEN_LENGTH)}`;
        await insertKeyFixture(f.db, f.a1, await hashApiKey(disabled), ['uploads:create']);
        expect(
          (await f.request(path, undefined, undefined, { authorization: `Bearer ${disabled}` }))
            .status,
        ).toBe(401);
        time = started + 3_600_000;
        expect((await get()).status).toBe(401);
        time = started + 61_000;
        expect(
          (
            await f.request(
              `${path}/keys/${key.id}`,
              undefined,
              f.owner.cookie,
              undefined,
              'DELETE',
            )
          ).status,
        ).toBe(204);
        expect((await get()).status).toBe(401);
        expect(
          (
            await f.request(path, undefined, undefined, {
              authorization: `Bearer ${readOnly.token}`,
            })
          ).status,
        ).toBe(200);
        expect((await f.request(path, undefined, f.owner.cookie, undefined, 'DELETE')).status).toBe(
          204,
        );
        expect(
          (
            await f.request(path, undefined, undefined, {
              authorization: `Bearer ${readOnly.token}`,
            })
          ).status,
        ).toBe(401);
        expect(f.logs.join('')).not.toContain(key.token);
      },
      {},
      { keyClock: { now: () => new Date(time) } },
    );
  },
  25_000,
);
