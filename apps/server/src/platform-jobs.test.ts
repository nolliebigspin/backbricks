import { expect, test } from 'bun:test';

import { createIds, defineModule, defineModuleCatalog, monthlyUsagePeriod } from '@backbricks/core';
import { createWithTenant } from '@backbricks/db';
import { z } from '@hono/zod-openapi';

import { available, scenario } from '../test/auth-fixture.ts';
import { instanceCatalog } from '../test/instance-fixture.ts';
import { prepareIsolationFixture } from '../test/isolation/setup.ts';

test.skipIf(!available)(
  'queued config migrations create system revisions, recompute retention and preserve newer edits/rollback',
  async () => {
    await scenario(
      async (base) => {
        const f = await prepareIsolationFixture(base);
        const withTenant = createWithTenant(f.db);
        const context = { organizationId: f.organizationId, projectId: f.a1.id };
        const ids = createIds({ now: f.now });
        const seed = (key: string) =>
          withTenant(context, async (tx) => {
            const instance = await tx.repositories.instances.insert({
              id: ids.generate('mod'),
              moduleType: 'sample',
              key,
              name: 'Legacy',
              status: 'active',
              config: { legacyTitle: 'Migrated title' },
              moduleVersion: 1,
              configVersion: 1,
              createdAt: f.now(),
              updatedAt: f.now(),
            });
            await tx.repositories.revisions.insert({
              id: ids.generate('rvn'),
              instanceId: instance.id,
              configVersion: 1,
              moduleVersion: 1,
              config: instance.config,
              actorType: 'system',
              actorId: null,
              createdAt: f.now(),
            });
            return instance;
          });
        const job = f.jobs().find((entry) => entry.name === 'core.instances.migrate');
        if (!job) throw new Error('Expected migration registration');
        const instance = await seed('legacy');
        await job.run(context, { moduleType: 'sample', key: 'legacy', configVersion: 1 });
        const migrated = await withTenant(context, (tx) =>
          tx.repositories.instances.get(instance.id),
        );
        expect(migrated).toMatchObject({
          moduleVersion: 2,
          configVersion: 2,
          config: { title: 'Migrated title' },
        });
        const revision = await withTenant(context, (tx) =>
          tx.repositories.revisions.get(instance.id, 2),
        );
        expect(revision).toMatchObject({ actorType: 'system', actorId: null });
        const before = await f.snapshot();
        await job.run(context, { moduleType: 'sample', key: 'legacy', configVersion: 1 });
        expect(await f.snapshot()).toEqual(before);
        expect(
          await withTenant(context, (tx) =>
            tx.repositories.usage.list(monthlyUsagePeriod(f.now())),
          ),
        ).toEqual([{ metric: 'sample.recomputed', value: 1n }]);
        await seed('failure');
        await f.db.execute(
          "alter table audit_logs add constraint fixture_migration_audit check (action <> 'instance.migrated') not valid",
        );
        const failureBefore = await f.snapshot();
        expect(
          await job
            .run(context, { moduleType: 'sample', key: 'failure', configVersion: 1 })
            .catch((error: unknown) => error),
        ).toMatchObject({ cause: { code: '23514' } });
        expect(await f.snapshot()).toEqual(failureBefore);
      },
      { BACKBRICKS_MODULES: 'sample' },
      { catalog: instanceCatalog(true, 2) },
    );
  },
  20_000,
);

test.skipIf(!available)(
  'retention and module subject-erasure jobs use selected hooks and atomic scoped audit',
  async () => {
    const label = { en: 'Maintenance fixture', de: 'Wartungstest' };
    const module = defineModule({
      type: 'maintenance',
      moduleVersion: 1,
      displayName: label,
      resourceName: { singular: 'record', plural: 'records' },
      infrastructure: [],
      configSchema: z.object({}).strict(),
      defaultConfig: () => ({}),
      scopes: [],
      events: [],
      usageMetrics: [
        { name: 'maintenance.purged', kind: 'counter', unit: 'count', label },
        { name: 'maintenance.erased', kind: 'counter', unit: 'count', label },
      ],
      retention: {
        recomputeExpiry: async () => 0,
        async purgeExpired(ctx, input) {
          expect(input.limit).toBe(100);
          await ctx.services.usage.increment(ctx.tx, { metric: 'maintenance.purged', delta: 1n });
          return 1;
        },
      },
      privacy: {
        exportSubject: async () => [],
        async deleteSubject(ctx, email) {
          expect(email).toBe('subject@example.invalid');
          await ctx.services.usage.increment(ctx.tx, { metric: 'maintenance.erased', delta: 1n });
          return 1;
        },
      },
    });
    await scenario(
      async (base) => {
        const f = await prepareIsolationFixture(base);
        const context = { organizationId: f.organizationId, projectId: f.a1.id };
        const retention = f.jobs().find((job) => job.name === 'core.retention.purge');
        const privacy = f.jobs().find((job) => job.name === 'core.privacy.erase');
        if (!retention || !privacy) throw new Error('Missing maintenance hooks');
        await retention.run(context, {});
        await privacy.run(context, { email: 'subject@example.invalid' });
        const withTenant = createWithTenant(f.db);
        expect(
          await withTenant(context, (tx) =>
            tx.repositories.usage.list(monthlyUsagePeriod(f.now())),
          ),
        ).toEqual([
          { metric: 'maintenance.erased', value: 1n },
          { metric: 'maintenance.purged', value: 1n },
        ]);
        expect(
          await withTenant({ organizationId: f.foreignId, projectId: f.b1.id }, (tx) =>
            tx.repositories.usage.list(monthlyUsagePeriod(f.now())),
          ),
        ).toEqual([]);
        const audit = await withTenant(context, (tx) => tx.repositories.audit.list({ limit: 100 }));
        expect(
          audit.filter((entry) => entry.actorType === 'system').map((entry) => entry.changes),
        ).toEqual([{ count: 1 }, { count: 1 }]);
        expect(JSON.stringify(audit)).not.toContain('subject@example.invalid');
        await f.db.execute(
          "alter table audit_logs add constraint fixture_erasure_audit check (action <> 'privacy.module_subject_erased') not valid",
        );
        const before = await f.snapshot();
        expect(
          await privacy
            .run(context, { email: 'subject@example.invalid' })
            .catch((error: unknown) => error),
        ).toMatchObject({ cause: { code: '23514' } });
        expect(await f.snapshot()).toEqual(before);
      },
      { BACKBRICKS_MODULES: 'maintenance' },
      { catalog: defineModuleCatalog([module]) },
    );
  },
  20_000,
);
