import { expect, test } from 'bun:test';

import { defineModule, defineModuleCatalog, PLATFORM_JOBS } from '@backbricks/core';
import { formsModule } from '@backbricks/module-forms';
import { z } from 'zod';

import { eventually } from '../../../scripts/test/eventually.ts';
import { available, scenario } from '../test/auth-fixture.ts';
import { prepareIsolationFixture } from '../test/isolation/setup.ts';

test.skipIf(!available)(
  'workers waiting on an archived project lock cannot create activity after its erasure commits',
  async () => {
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const probe = defineModule({
      type: 'probe',
      moduleVersion: 1,
      displayName: { en: 'Probe', de: 'Probe' },
      resourceName: { singular: 'probe', plural: 'probes' },
      infrastructure: [],
      configSchema: z.object({}).strict(),
      defaultConfig: () => ({}),
      scopes: [],
      events: [],
      usageMetrics: [],
      jobs(registrar) {
        registrar.register(
          { name: 'probe.tick', retries: 0, retentionSeconds: 3600 },
          z.object({}).strict(),
          async (runtime) => {
            await runtime.services.audit.record(runtime.tx, {
              actorType: 'system',
              action: 'fixture.job_after_erasure',
            });
          },
        );
      },
      retention: {
        async purgeExpired(runtime) {
          await runtime.services.audit.record(runtime.tx, {
            actorType: 'system',
            action: 'fixture.retention_after_erasure',
          });
          return 0;
        },
        recomputeExpiry: async () => 0,
      },
      privacy: {
        exportSubject: async () => ({}),
        deleteSubject: async () => 0,
        async eraseScope() {
          entered.resolve();
          await release.promise;
          return 0;
        },
      },
    });
    await scenario(
      async (base) => {
        const f = await prepareIsolationFixture(base);
        const work: Promise<unknown>[] = [];
        try {
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
          const erase = f.jobs().find((job) => job.name === PLATFORM_JOBS.projectErasure);
          const tick = f.jobs().find((job) => job.name === 'probe.tick');
          const retention = f.jobs().find((job) => job.name === PLATFORM_JOBS.retentionPurge);
          if (!erase || !tick || !retention) throw new Error('Missing workers');
          work.push(
            erase.run(
              { organizationId: f.organizationId, projectId: f.a1.id, archivedProject: true },
              {},
            ),
          );
          await entered.promise;
          const maintenance = {
            organizationId: f.organizationId,
            projectId: f.a1.id,
            archivedMaintenance: true as const,
          };
          work.push(tick.run(maintenance, {}), retention.run(maintenance, {}));
          await eventually(
            async () =>
              (
                await f.db.execute<{ n: number }>(
                  "select count(*)::int as n from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock' and query ilike '%projects%'",
                )
              ).rows[0]?.n === 2,
          );
          release.resolve();
          await Promise.all(work);
          expect(
            (
              await f.db.execute<{ erased_at: unknown }>(
                `select erased_at from projects where id = '${f.a1.id}'`,
              )
            ).rows[0]?.erased_at,
          ).not.toBeNull();
          expect(
            (
              await f.db.execute<{ action: string }>(
                "select action from audit_logs where action in ('fixture.job_after_erasure','fixture.retention_after_erasure')",
              )
            ).rows,
          ).toEqual([]);
        } finally {
          release.resolve();
          await Promise.allSettled(work);
        }
      },
      { BACKBRICKS_MODULES: 'forms,probe' },
      {
        durableDelivery: true,
        consumeJobs: false,
        catalog: defineModuleCatalog([formsModule, probe]),
      },
    );
  },
  20_000,
);
