import { expect, test } from 'bun:test';

import {
  createApiKeyMaterial,
  createIds,
  createUsageService,
  integrationResponseSchema,
  MAX_USAGE_VALUE,
  monthlyUsagePeriod,
  usageResponseSchema,
  systemClock,
} from '@backbricks/core';
import { createWithTenant } from '@backbricks/db';

import { available, scenario } from '../test/auth-fixture.ts';
import { prepareIsolationFixture } from '../test/isolation/setup.ts';
import { issueKey } from '../test/platform-read-fixture.ts';

test.skipIf(!available)(
  'integration reads expose only active public credentials without creating keys or disclosing private configuration',
  async () => {
    let now = systemClock.now();
    await scenario(
      async (base) => {
        const f = await prepareIsolationFixture(base);
        const path = `/v1/projects/${f.a1.id}`;
        const withTenant = createWithTenant(f.db);
        const context = { organizationId: f.organizationId, projectId: f.a1.id };
        const initial = integrationResponseSchema.parse(
          await (await f.request(`${path}/integration`, undefined, f.member.cookie)).json(),
        );
        expect(initial).toEqual({
          baseUrl: `${f.origin}/v1`,
          project: { id: f.a1.id, name: 'A1', slug: 'a1', allowedOrigins: [] },
          publicKey: null,
        });
        expect(
          await withTenant(context, ({ repositories }) => repositories.keys.list({ limit: 100 })),
        ).toEqual([]);
        const secret = await issueKey(f, f.a1.id, {
          kind: 'secret',
          name: 'Private key name',
          scopes: ['integration:read'],
          expiresAt: null,
        });
        const stats = await issueKey(f, f.a1.id, {
          kind: 'secret',
          name: 'Stats only',
          scopes: ['stats:read'],
          expiresAt: null,
        });
        const publicKey = await issueKey(f, f.a1.id, {
          kind: 'publishable',
          name: 'Public',
          expiresAt: null,
        });
        const ids = createIds({ now: f.now });
        now = new Date(now.getTime() + 1000);
        await withTenant(context, async ({ repositories }) => {
          for (let index = 0; index < 101; index++) {
            // oxlint-disable-next-line no-await-in-loop -- Generate independent material and persist within the same fixture transaction.
            const material = await createApiKeyMaterial('secret');
            // oxlint-disable-next-line no-await-in-loop -- Later secret rows must not hide the older active publishable row behind a page boundary.
            await repositories.keys.insert({
              ...material.stored,
              id: ids.generate('key'),
              name: 'Later secret fixture',
              scopes: ['stats:read'],
              createdBy: null,
              createdAt: f.now(),
              lastUsedAt: null,
              expiresAt: null,
              revokedAt: null,
            });
          }
        });
        const read = await f.request(`${path}/integration`, undefined, undefined, {
          authorization: `Bearer ${secret.token}`,
        });
        expect(read.status).toBe(200);
        const text = await read.text();
        const result = integrationResponseSchema.parse(JSON.parse(text));
        expect(result.publicKey).toBe(publicKey.token);
        for (const privateValue of [
          secret.token,
          secret.displayPrefix,
          secret.name,
          f.owner.email,
          'lookupHash',
          'settings',
          'organizationId',
        ])
          expect(text).not.toContain(privateValue);
        expect(
          (
            await f.request(`${path}/integration`, undefined, f.owner.cookie, {
              authorization: `Bearer ${stats.token}`,
            })
          ).status,
        ).toBe(403);
        expect(
          (
            await f.request(`${path}/integration`, undefined, f.owner.cookie, {
              authorization: `Bearer ${publicKey.token}`,
            })
          ).status,
        ).toBe(403);
        expect(
          (
            await f.request(`/v1/projects/${f.a2.id}/integration`, undefined, undefined, {
              authorization: `Bearer ${secret.token}`,
            })
          ).status,
        ).toBe(404);
        expect(
          (
            await f.request(`/v1/projects/${f.b1.id}/integration`, undefined, undefined, {
              authorization: `Bearer ${secret.token}`,
            })
          ).status,
        ).toBe(404);
        now = new Date(now.getTime() + 1000);
        const expiresAt = new Date(now.getTime() + 1000);
        const expiring = await issueKey(f, f.a1.id, {
          kind: 'publishable',
          name: 'New public',
          expiresAt: expiresAt.toISOString(),
        });
        expect(
          integrationResponseSchema.parse(
            await (await f.request(`${path}/integration`, undefined, f.owner.cookie)).json(),
          ).publicKey,
        ).toBe(expiring.token);
        now = expiresAt;
        expect(
          integrationResponseSchema.parse(
            await (await f.request(`${path}/integration`, undefined, f.owner.cookie)).json(),
          ).publicKey,
        ).toBe(publicKey.token);
        expect(
          (
            await f.request(
              `${path}/keys/${publicKey.id}`,
              undefined,
              f.owner.cookie,
              undefined,
              'DELETE',
            )
          ).status,
        ).toBe(204);
        expect(
          integrationResponseSchema.parse(
            await (await f.request(`${path}/integration`, undefined, f.owner.cookie)).json(),
          ).publicKey,
        ).toBeNull();
      },
      {},
      { keyClock: { now: () => new Date(now) } },
    );
  },
  20_000,
);

test.skipIf(!available)(
  'usage reads preserve precision and enforce period/tenant/scope policies',
  async () => {
    await scenario(async (base) => {
      const f = await prepareIsolationFixture(base);
      const withTenant = createWithTenant(f.db);
      const usage = createUsageService({ now: f.now });
      await withTenant({ organizationId: f.organizationId, projectId: f.a1.id }, (tx) =>
        usage.increment(tx, { metric: 'fixture.large', delta: MAX_USAGE_VALUE }),
      );
      await withTenant({ organizationId: f.foreignId, projectId: f.b1.id }, (tx) =>
        usage.increment(tx, { metric: 'fixture.foreign', delta: 5n }),
      );
      const path = `/v1/projects/${f.a1.id}`;
      const period = monthlyUsagePeriod(f.now());
      const before = await f.snapshot();
      const response = await f.request(`${path}/usage`, undefined, f.member.cookie);
      expect(response.status).toBe(200);
      const result = usageResponseSchema.parse(await response.json());
      expect(result).toEqual({
        period,
        data: [{ metric: 'fixture.large', value: MAX_USAGE_VALUE.toString() }],
      });
      expect(await f.snapshot()).toEqual(before);
      const stats = await issueKey(f, f.a1.id, {
        kind: 'secret',
        name: 'Stats',
        scopes: ['stats:read'],
        expiresAt: null,
      });
      const integration = await issueKey(f, f.a1.id, {
        kind: 'secret',
        name: 'Integration',
        scopes: ['integration:read'],
        expiresAt: null,
      });
      expect(
        (
          await f.request(`${path}/usage`, undefined, undefined, {
            authorization: `Bearer ${stats.token}`,
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await f.request(`${path}/usage`, undefined, f.owner.cookie, {
            authorization: `Bearer ${integration.token}`,
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await f.request(`/v1/projects/${f.b1.id}/usage`, undefined, undefined, {
            authorization: `Bearer ${stats.token}`,
          })
        ).status,
      ).toBe(404);
      const failures = await Promise.all(
        [
          'period=0000-01-01',
          'period=2026-11-02',
          'period=2026-13-01',
          `organizationId=${f.foreignId}`,
          'metric=.*',
        ].map((query) => f.request(`${path}/usage?${query}`, undefined, f.owner.cookie)),
      );
      expect(failures.every((item) => item.status === 422)).toBe(true);
      const empty = usageResponseSchema.parse(
        await (
          await f.request(`${path}/usage?period=2020-01-01`, undefined, f.owner.cookie)
        ).json(),
      );
      expect(empty.data).toEqual([]);
    });
  },
  20_000,
);
