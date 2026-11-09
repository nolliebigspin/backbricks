import { z } from 'zod';

import { AppError } from '../errors/app-error.ts';
import { pageQuerySchema, pageResult, repositoryPage } from '../http/pagination.ts';
import type { InstanceDependencies } from '../instances/persistence.ts';
import { activityNameSchema } from '../platform/activity-fields.ts';
import type { Queue } from '../services/providers.ts';
import type { TenantTransaction } from '../tenancy/tenant-context.ts';
import { MAX_MAINTENANCE_BATCH, type ProjectJobEnqueue } from './contract.ts';
import { PLATFORM_JOBS } from './platform-names.ts';

const payloadSchema = z
  .object({
    runId: z.uuid(),
    cursor: pageQuerySchema.shape.cursor,
    job: activityNameSchema.optional(),
  })
  .strict();
export const TENANT_MAINTENANCE_DEFINITIONS = Object.freeze([
  {
    name: PLATFORM_JOBS.maintenanceFanout,
    payload: payloadSchema,
    retries: 2,
    retentionSeconds: 3600,
  },
  {
    name: PLATFORM_JOBS.projectMaintenance,
    payload: payloadSchema,
    retries: 2,
    retentionSeconds: 3600,
  },
]);
export type MaintenanceScheduling = { queue: Queue; enqueueProject: ProjectJobEnqueue };

/** Bounded, durable project/instance pagination. Retried pages reuse stable run/consumer identities. */
export function createTenantMaintenanceHandlers(
  deps: InstanceDependencies,
  scheduling?: MaintenanceScheduling,
) {
  const selectedJob = (name: string) =>
    deps.registry.modules
      .flatMap((module) => module.jobs)
      .find((job) => job.name === name && job.cron);
  return [
    {
      name: PLATFORM_JOBS.maintenanceFanout,
      async runInTransaction(this: void, tx: TenantTransaction, input: unknown) {
        if (!scheduling) throw new AppError('service_unavailable');
        const data = payloadSchema.parse(input);
        if (data.job && !selectedJob(data.job)) return;
        const page = pageResult(
          await tx.repositories.projects.list(
            repositoryPage({ limit: MAX_MAINTENANCE_BATCH, cursor: data.cursor }),
          ),
          MAX_MAINTENANCE_BATCH,
        );
        for (const project of page.data) {
          // oxlint-disable-next-line no-await-in-loop -- Fan-out shares this org transaction and verifies every project selector.
          await scheduling.enqueueProject(tx, {
            projectId: project.id,
            name: PLATFORM_JOBS.projectMaintenance,
            payload: { runId: data.runId, job: data.job },
            singletonKey: `${data.runId}:${data.job ?? 'maintenance'}`,
          });
        }
        if (page.nextCursor)
          await scheduling.queue.enqueue(
            tx,
            PLATFORM_JOBS.maintenanceFanout,
            { ...data, cursor: page.nextCursor },
            { singletonKey: `${data.runId}:${page.nextCursor}` },
          );
      },
    },
    {
      name: PLATFORM_JOBS.projectMaintenance,
      async runInTransaction(this: void, tx: TenantTransaction, input: unknown) {
        if (!scheduling) throw new AppError('service_unavailable');
        if (!tx.context.projectId) throw new AppError('not_found');
        const data = payloadSchema.parse(input);
        if (data.job) {
          const job = selectedJob(data.job);
          if (job) await scheduling.queue.enqueue(tx, job.name, {}, { singletonKey: data.runId });
          return;
        }
        if (!data.cursor)
          await scheduling.queue.enqueue(
            tx,
            PLATFORM_JOBS.retentionPurge,
            {},
            { singletonKey: data.runId },
          );
        const page = pageResult(
          await tx.repositories.instances.list(
            repositoryPage({ limit: MAX_MAINTENANCE_BATCH, cursor: data.cursor }),
            undefined,
            { includeArchived: false },
          ),
          MAX_MAINTENANCE_BATCH,
        );
        for (const instance of page.data) {
          const module = deps.registry.get(instance.moduleType);
          if (module && instance.moduleVersion < module.moduleVersion) {
            // oxlint-disable-next-line no-await-in-loop -- Enlist each expected-version migration in this same project transaction.
            await scheduling.queue.enqueue(
              tx,
              PLATFORM_JOBS.instanceMigration,
              { moduleType: module.type, key: instance.key, configVersion: instance.configVersion },
              { singletonKey: `${instance.id}:${instance.configVersion}:${module.moduleVersion}` },
            );
          }
        }
        if (page.nextCursor)
          await scheduling.queue.enqueue(
            tx,
            PLATFORM_JOBS.projectMaintenance,
            { ...data, cursor: page.nextCursor },
            { singletonKey: `${data.runId}:${page.nextCursor}` },
          );
      },
    },
  ];
}
