import { expect, test } from 'bun:test';

import { createIds, systemClock, instanceResponseSchema } from '@backbricks/core';
import { createWithTenant } from '@backbricks/db';

import { available, scenario } from '../test/auth-fixture.ts';
import { instanceCatalog } from '../test/instance-fixture.ts';
import { prepareIsolationFixture } from '../test/isolation/setup.ts';

test.skipIf(!available)(
  'lazy migration never writes; explicit migration and rollback create immutable versions atomically',
  async () => {
    await scenario(
      async (base) => {
        const f = await prepareIsolationFixture(base);
        const context = { organizationId: f.organizationId, projectId: f.a1.id };
        const tenant = createWithTenant(f.db);
        const ids = createIds(systemClock);
        const seed = (key: string, moduleVersion: number, config: unknown) =>
          tenant(context, async ({ repositories: r }) => {
            const row = await r.instances.insert({
              id: ids.generate('mod'),
              key,
              name: key,
              moduleType: 'sample',
              configVersion: 1,
              moduleVersion,
              config,
              status: 'active',
              createdAt: f.now(),
              updatedAt: f.now(),
            });
            await r.revisions.insert({
              id: ids.generate('rvn'),
              instanceId: row.id,
              configVersion: 1,
              moduleVersion,
              config,
              actorType: 'system',
              actorId: null,
              createdAt: f.now(),
            });
            return row;
          });
        const old = await seed('old', 1, { legacyTitle: 'Old title' });
        await seed('future', 3, { title: 'Future' });
        await seed('broken', 1, { invalid: true });
        const path = `/v1/projects/${f.a1.id}/samples/old`;
        const before = await f.snapshot();
        const read = instanceResponseSchema.parse(
          await (await f.request(path, undefined, f.member.cookie)).json(),
        );
        expect(read).toMatchObject({
          configVersion: 1,
          moduleVersion: 2,
          storedModuleVersion: 1,
          config: { title: 'Old title' },
        });
        expect((await f.request(path, undefined, f.member.cookie)).status).toBe(200);
        expect(
          (await f.request(path.replace('/old', '/future'), undefined, f.owner.cookie)).status,
        ).toBe(422);
        expect(
          (await f.request(path.replace('/old', '/broken'), undefined, f.owner.cookie)).status,
        ).toBe(422);
        expect(await f.snapshot()).toEqual(before);
        // Audit and outbox each fail on their own; either failure rolls back the migration and both tables.
        for (const [table, column] of [
          ['events', 'type'],
          ['audit_logs', 'action'],
        ] as const) {
          // oxlint-disable-next-line no-await-in-loop -- One disposable constraint at a time.
          await f.db.execute(
            `alter table ${table} add constraint fixture_migration_failure check (${column} <> 'instance.migrated') not valid`,
          );
          expect(
            // oxlint-disable-next-line no-await-in-loop -- See above.
            (await f.request(`${path}/migrate`, { configVersion: 1 }, f.owner.cookie)).status,
          ).toBe(500);
          // oxlint-disable-next-line no-await-in-loop -- See above.
          expect(await f.snapshot()).toEqual(before);
          // oxlint-disable-next-line no-await-in-loop -- See above.
          await f.db.execute(`alter table ${table} drop constraint fixture_migration_failure`);
        }
        expect(
          (await f.request(`${path}/migrate`, { configVersion: 1 }, f.owner.cookie)).status,
        ).toBe(200);
        const migrated = await f.snapshot();
        expect(
          (await f.request(`${path}/migrate`, { configVersion: 2 }, f.owner.cookie)).status,
        ).toBe(200);
        expect(await f.snapshot()).toEqual(migrated);
        expect(
          (await f.request(`${path}/revisions/1/rollback`, { configVersion: 2 }, f.admin.cookie))
            .status,
        ).toBe(200);
        const history = await tenant(context, ({ repositories: r }) =>
          r.revisions.list(old.id, { limit: 100 }),
        );
        expect(history.map((r) => r.configVersion).toSorted((a, b) => a - b)).toEqual([1, 2, 3]);
        expect(history.find((r) => r.configVersion === 1)?.config).toEqual({
          legacyTitle: 'Old title',
        });
        const concurrent = await Promise.all(
          [1, 2].map(() =>
            f.request(`${path}/revisions/1/rollback`, { configVersion: 3 }, f.owner.cookie),
          ),
        );
        expect(concurrent.map((r) => r.status).toSorted((a, b) => a - b)).toEqual([200, 409]);
        expect(
          (await f.request(`${path}/revisions/99/rollback`, { configVersion: 4 }, f.owner.cookie))
            .status,
        ).toBe(404);
        const publicHistory = await f.request(
          `${path}/revisions?limit=1`,
          undefined,
          f.member.cookie,
        );
        expect(publicHistory.status).toBe(200);
        expect(await publicHistory.text()).not.toContain('actorId');
      },
      { BACKBRICKS_MODULES: 'sample' },
      { catalog: instanceCatalog(true, 2) },
    );
  },
  30_000,
);
