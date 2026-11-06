import { expect, test } from 'bun:test';

import { instanceResponseSchema } from '@backbricks/core';
import { createWithTenant } from '@backbricks/db';

import { available, scenario } from '../test/auth-fixture.ts';
import { instanceCatalog } from '../test/instance-fixture.ts';
import { prepareIsolationFixture } from '../test/isolation/setup.ts';
import { issueKey } from '../test/platform-read-fixture.ts';

const headers = (token: string) => ({ authorization: `Bearer ${token}` });

test.skipIf(!available)(
  'instance keys require explicit destructive permission and cannot escape their project',
  async () => {
    await scenario(
      async (base) => {
        const f = await prepareIsolationFixture(base);
        const root = `/v1/projects/${f.a1.id}/samples`;
        const keys = await Promise.all(
          [
            ['config:write'],
            ['config:read'],
            ['config:write', 'config:destructive'],
            ['config:destructive'],
          ].map((scopes) =>
            issueKey(f, f.a1.id, { kind: 'secret', name: 'Fixture', scopes, expiresAt: null }),
          ),
        );
        const [writer, reader, destructive, destructiveOnly] = keys;
        if (!writer || !reader || !destructive || !destructiveOnly)
          throw new Error('Expected keys');
        const created = await f.request(
          root,
          { key: 'contact', name: 'Private label' },
          undefined,
          headers(writer.token),
        );
        expect(created.status).toBe(201);
        const instance = instanceResponseSchema.parse(await created.json());
        const path = `${root}/contact`;
        const patch = (token: string, configVersion: number, config: unknown) =>
          f.request(path, { configVersion, config }, undefined, headers(token), 'PATCH');
        expect((await f.request(path, undefined, undefined, headers(reader.token))).status).toBe(
          200,
        );
        expect((await f.request(root, undefined, undefined, headers(writer.token))).status).toBe(
          403,
        );
        expect((await patch(writer.token, 1, { title: 'Safe' })).status).toBe(200);
        // Authentication updates lastUsedAt even when the eventual operation lacks a scope.
        await f.request(root, undefined, undefined, headers(destructiveOnly.token));
        const before = await f.snapshot();
        expect((await patch(writer.token, 2, { fields: [] })).status).toBe(403);
        expect((await patch(reader.token, 2, { title: 'Denied' })).status).toBe(403);
        expect((await patch(destructiveOnly.token, 2, { fields: [] })).status).toBe(403);
        expect(
          (
            await f.request(
              `${path}?configVersion=2`,
              undefined,
              undefined,
              headers(writer.token),
              'DELETE',
            )
          ).status,
        ).toBe(403);
        expect(
          (
            await f.request(
              `${path}?configVersion=2`,
              undefined,
              undefined,
              headers(destructiveOnly.token),
              'DELETE',
            )
          ).status,
        ).toBe(403);
        expect(
          (
            await f.request(
              `/v1/projects/${f.a2.id}/samples/contact`,
              undefined,
              f.owner.cookie,
              headers(reader.token),
            )
          ).status,
        ).toBe(404);
        expect(
          (await f.request(`${root}/${instance.id}`, undefined, undefined, headers(reader.token)))
            .status,
        ).toBe(422);
        expect(
          (
            await f.request(
              path,
              { configVersion: 2, status: 'archived' },
              undefined,
              headers(writer.token),
              'PATCH',
            )
          ).status,
        ).toBe(422);
        expect(await f.snapshot()).toEqual(before);
        expect((await patch(destructive.token, 2, { fields: [] })).status).toBe(200);
        expect(
          (
            await f.request(
              `${path}?configVersion=2`,
              undefined,
              undefined,
              headers(destructive.token),
              'DELETE',
            )
          ).status,
        ).toBe(409);
        expect(
          (
            await f.request(
              `${path}?configVersion=3`,
              undefined,
              undefined,
              headers(destructive.token),
              'DELETE',
            )
          ).status,
        ).toBe(204);
        const doc = await f.request('/v1/openapi.json');
        expect(doc.status).toBe(200);
        expect(await doc.text()).toContain('sample.instance.update');
        expect(created.headers.get('cache-control')).toBe('no-store');
        expect(JSON.stringify(f.logs)).not.toContain('Private label');
      },
      { BACKBRICKS_MODULES: 'sample' },
      { catalog: instanceCatalog() },
    );
  },
  30_000,
);

test.skipIf(!available)(
  'unclassified changes fail closed and the public service enforces access and active module/project',
  async () => {
    const catalog = instanceCatalog(false);
    await scenario(
      async (base) => {
        const f = await prepareIsolationFixture(base);
        const root = `/v1/projects/${f.a1.id}/samples`;
        expect(
          (await f.request(root, { key: 'contact', name: 'Fixture' }, f.owner.cookie)).status,
        ).toBe(201);
        const writer = await issueKey(f, f.a1.id, {
          kind: 'secret',
          name: 'Writer',
          scopes: ['config:write'],
          expiresAt: null,
        });
        await f.request(root, undefined, undefined, { authorization: `Bearer ${writer.token}` });
        const before = await f.snapshot();
        expect(
          (
            await f.request(
              `${root}/contact`,
              { configVersion: 1, config: { title: 'Changed' } },
              undefined,
              { authorization: `Bearer ${writer.token}` },
              'PATCH',
            )
          ).status,
        ).toBe(403);
        expect(await f.snapshot()).toEqual(before);
        const service = f.instances();
        const context = { organizationId: f.organizationId, projectId: f.a1.id };
        const withTenant = createWithTenant(f.db);
        expect(
          await withTenant(context, (tx) =>
            service.create(tx, 'sample', { key: 'direct', name: 'Denied' }),
          ).catch((error: unknown) => error),
        ).toMatchObject({ code: 'unauthorized' });
        const member = { kind: 'session' as const, id: f.member.id, role: 'member' as const };
        expect(
          await withTenant({ ...context, principal: member }, (tx) =>
            service.update(tx, 'sample', 'contact', { configVersion: 1, name: 'Denied' }),
          ).catch((error: unknown) => error),
        ).toMatchObject({ code: 'forbidden' });
        const owner = { kind: 'session' as const, id: f.owner.id, role: 'owner' as const };
        expect(
          await withTenant({ ...context, principal: owner }, (tx) =>
            service.create(tx, 'disabled', { key: 'direct', name: 'Denied' }),
          ).catch((error: unknown) => error),
        ).toMatchObject({ code: 'module_not_enabled' });
        expect(
          await withTenant({ ...context, principal: owner }, (tx) =>
            service.get(tx, 'sample', 'foreign-only'),
          ).catch((error: unknown) => error),
        ).toMatchObject({ code: 'not_found' });
        expect(
          (
            await f.request(
              `/v1/projects/${f.a1.id}`,
              undefined,
              f.owner.cookie,
              undefined,
              'DELETE',
            )
          ).status,
        ).toBe(204);
        expect(
          (await f.request(root, { key: 'archived-parent', name: 'Denied' }, f.owner.cookie))
            .status,
        ).toBe(404);
      },
      { BACKBRICKS_MODULES: 'sample' },
      { catalog },
    );
  },
  30_000,
);

test.skipIf(!available)(
  'instance create/update/archive fully roll back when revision, audit or outbox persistence fails',
  async () => {
    await scenario(
      async (base) => {
        const f = await prepareIsolationFixture(base);
        const root = `/v1/projects/${f.a1.id}/samples`;
        expect(
          (await f.request(root, { key: 'contact', name: 'Fixture' }, f.owner.cookie)).status,
        ).toBe(201);
        for (const [table, clause] of [
          ['module_instance_revisions', 'config_version < 0'],
          [
            'audit_logs',
            "action not in ('instance.created', 'instance.updated', 'instance.archived')",
          ],
          ['events', "type not in ('instance.created', 'instance.updated', 'instance.archived')"],
        ]) {
          // oxlint-disable-next-line no-await-in-loop -- Fixed identifiers; force one persistence failure at a time.
          await f.db.execute(
            `alter table ${table} add constraint fixture_instance_failure check (${clause}) not valid`,
          );
          for (const operation of [
            { path: root, method: 'POST', body: { key: 'failed-create', name: 'Failed' } },
            {
              path: `${root}/contact`,
              method: 'PATCH',
              body: { configVersion: 1, config: { title: 'Failed' } },
            },
            { path: `${root}/contact?configVersion=1`, method: 'DELETE', body: undefined },
          ]) {
            // oxlint-disable-next-line no-await-in-loop -- Each attempted mutation has an independent state snapshot.
            const before = await f.snapshot();
            // oxlint-disable-next-line no-await-in-loop -- Wait for rollback before reading state.
            const response = await f.request(
              operation.path,
              operation.body,
              f.owner.cookie,
              undefined,
              operation.method,
            );
            expect(response.status).toBe(500);
            // oxlint-disable-next-line no-await-in-loop -- Raw constraint/SQL details never reach HTTP callers.
            expect(await response.text()).not.toContain('fixture_instance_failure');
            // oxlint-disable-next-line no-await-in-loop -- Includes configuration, all revisions, audit and outbox.
            expect(await f.snapshot()).toEqual(before);
          }
          // oxlint-disable-next-line no-await-in-loop -- Remove only this test's constraint before the next control.
          await f.db.execute(`alter table ${table} drop constraint fixture_instance_failure`);
        }
      },
      { BACKBRICKS_MODULES: 'sample' },
      { catalog: instanceCatalog() },
    );
  },
  30_000,
);
