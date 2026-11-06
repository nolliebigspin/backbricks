/* oxlint-disable no-await-in-loop -- Each bounded fixture page uses one physical tenant transaction. */
import { expect, test } from 'bun:test';

import {
  createIds,
  defineModule,
  defineModuleCatalog,
  monthlyUsagePeriod,
  PLATFORM_JOBS,
} from '@backbricks/core';
import { createWithTenant } from '@backbricks/db';
import { z } from '@hono/zod-openapi';

import { available, scenario } from '../test/auth-fixture.ts';
import { prepareIsolationFixture } from '../test/isolation/setup.ts';

const label = { en: 'Scheduled fixture', de: 'Geplanter Test' };
const config = z.object({ enabled: z.boolean().default(true) }).strict();
const catalog = defineModuleCatalog([
  defineModule({
    type: 'cronfixture',
    moduleVersion: 2,
    displayName: label,
    resourceName: { singular: 'schedule', plural: 'schedules' },
    infrastructure: [],
    configSchema: config,
    defaultConfig: () => config.parse({}),
    migrateConfig: (_version, input) => config.parse(input),
    scopes: [],
    events: [],
    usageMetrics: [{ name: 'cronfixture.runs', kind: 'counter', unit: 'count', label }],
    jobs(registrar) {
      registrar.register(
        { name: 'cronfixture.scheduled', cron: '0 * * * *', retries: 1, retentionSeconds: 3600 },
        z.object({}).strict(),
        async (ctx) => {
          await ctx.services.usage.increment(ctx.tx, { metric: 'cronfixture.runs', delta: 1n });
        },
      );
    },
    retention: { purgeExpired: async () => 0, recomputeExpiry: async () => 0 },
    privacy: { exportSubject: async () => [], deleteSubject: async () => 0 },
  }),
]);
const queueRows = z.object({
  rows: z.array(
    z.object({
      name: z.string(),
      data: z.object({
        organizationId: z.string(),
        projectId: z.string().optional(),
        payload: z.record(z.string(), z.unknown()),
      }),
    }),
  ),
});

test.skipIf(!available)(
  'maintenance fan-out paginates projects/instances, deduplicates retries and schedules only selected tenant jobs',
  async () => {
    await scenario(
      async (base) => {
        const f = await prepareIsolationFixture(base);
        const ids = createIds({ now: f.now });
        const withTenant = createWithTenant(f.db);
        const org = { organizationId: f.organizationId };
        const project = { ...org, projectId: f.a1.id };
        await withTenant(org, async (tx) => {
          for (let index = 0; index < 101; index++)
            await tx.repositories.projects.insert({
              id: ids.generate('prj'),
              name: `Project ${index}`,
              slug: `project-${index}`,
              allowedOrigins: [],
              settings: {},
              createdAt: f.now(),
              updatedAt: f.now(),
              deletedAt: null,
            });
        });
        const fanout = f.jobs().find((job) => job.name === PLATFORM_JOBS.maintenanceFanout);
        const projectJob = f.jobs().find((job) => job.name === PLATFORM_JOBS.projectMaintenance);
        const scheduled = f.jobs().find((job) => job.name === 'cronfixture.scheduled');
        if (!fanout || !projectJob || !scheduled)
          throw new Error('Missing selected maintenance registrations');
        const runId = crypto.randomUUID();
        const payload = { runId, job: scheduled.name };
        await fanout.run(org, payload);
        const read = async () =>
          queueRows.parse(
            await f.db.execute(
              "select name, data from pgboss.job where name <> 'core.mail.deliver'",
            ),
          ).rows;
        let queued = await read();
        expect(queued.filter((row) => row.name === PLATFORM_JOBS.projectMaintenance)).toHaveLength(
          100,
        );
        const continuation = queued.find((row) => row.name === PLATFORM_JOBS.maintenanceFanout);
        if (!continuation) throw new Error('Expected durable project cursor');
        await fanout.run(org, continuation.data.payload);
        queued = await read();
        const projects = queued.filter((row) => row.name === PLATFORM_JOBS.projectMaintenance);
        expect(projects).toHaveLength(103);
        expect(new Set(projects.map((row) => row.data.projectId)).size).toBe(103);
        expect(projects.every((row) => row.data.organizationId === f.organizationId)).toBe(true);
        expect(projects.some((row) => row.data.projectId === f.b1.id)).toBe(false);
        await fanout.run(org, payload);
        expect(await read()).toHaveLength(queued.length);
        await projectJob.run(project, payload);
        await projectJob.run(project, payload);
        expect((await read()).filter((row) => row.name === scheduled.name)).toHaveLength(1);
        await scheduled.run(project, {});
        expect(
          await withTenant(project, (tx) =>
            tx.repositories.usage.list(monthlyUsagePeriod(f.now())),
          ),
        ).toEqual([{ metric: 'cronfixture.runs', value: 1n }]);
        await withTenant(project, async (tx) => {
          for (let index = 0; index < 101; index++)
            await tx.repositories.instances.insert({
              id: ids.generate('mod'),
              moduleType: 'cronfixture',
              key: `legacy-${index}`,
              name: 'Legacy',
              status: 'active',
              config: { enabled: true },
              moduleVersion: 1,
              configVersion: 1,
              createdAt: f.now(),
              updatedAt: f.now(),
            });
        });
        const migrationRun = { runId: crypto.randomUUID() };
        await projectJob.run(project, migrationRun);
        queued = await read();
        expect(queued.filter((row) => row.name === PLATFORM_JOBS.instanceMigration)).toHaveLength(
          100,
        );
        const next = queued.find(
          (row) => row.name === PLATFORM_JOBS.projectMaintenance && row.data.payload['cursor'],
        );
        if (!next) throw new Error('Expected durable instance cursor');
        await projectJob.run(project, next.data.payload);
        queued = await read();
        expect(queued.filter((row) => row.name === PLATFORM_JOBS.instanceMigration)).toHaveLength(
          101,
        );
        expect(queued.filter((row) => row.name === PLATFORM_JOBS.retentionPurge)).toHaveLength(1);
        const before = queued.length;
        await fanout.run(org, { runId: crypto.randomUUID(), job: 'disabled.scheduled' });
        expect(await read()).toHaveLength(before);
      },
      { BACKBRICKS_MODULES: 'cronfixture' },
      { catalog, durableDelivery: true, consumeJobs: false },
    );
  },
  20_000,
);
