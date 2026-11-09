import { z } from 'zod';

import { AppError } from '../errors/app-error.ts';
import {
  instancePersistence,
  validatedConfig,
  type InstanceDependencies,
} from '../instances/persistence.ts';
import { instanceCreateSchema, instanceVersionSchema } from '../instances/schemas.ts';
import { moduleNameSchema } from '../modules/values.ts';
import {
  createNotificationDeliveryHandlers,
  type NotificationDeliveryOptions,
} from '../notifications/delivery.ts';
import {
  createNotificationDispatchHandler,
  NOTIFICATION_JOB_DEFINITIONS,
} from '../notifications/jobs.ts';
import { emailAddressSchema } from '../platform/values.ts';
import type { TenantTransaction } from '../tenancy/tenant-context.ts';
import { MAX_MAINTENANCE_BATCH, type QueueJobHandler } from './contract.ts';
import { PLATFORM_JOBS } from './platform-names.ts';
import {
  createTenantMaintenanceHandlers,
  TENANT_MAINTENANCE_DEFINITIONS,
  type MaintenanceScheduling,
} from './tenant-maintenance.ts';

const migrationPayload = z
  .object({
    moduleType: moduleNameSchema,
    key: instanceCreateSchema.shape.key,
    configVersion: instanceVersionSchema,
  })
  .strict();
/** A run purges in bounded rounds; a full batch queues the next round, the rest waits for the next run. */
export const MAX_RETENTION_ROUNDS = 50;
const retentionPayload = z
  .object({
    runId: z.uuid().optional(),
    round: z.number().int().min(1).max(MAX_RETENTION_ROUNDS).optional(),
  })
  .strict();
const erasurePayload = z.object({ email: emailAddressSchema }).strict();
export const PLATFORM_JOB_DEFINITIONS = Object.freeze([
  ...NOTIFICATION_JOB_DEFINITIONS,
  ...TENANT_MAINTENANCE_DEFINITIONS,
  {
    name: PLATFORM_JOBS.instanceMigration,
    payload: migrationPayload,
    retentionSeconds: 86_400,
    retries: 2,
  },
  {
    name: PLATFORM_JOBS.retentionPurge,
    payload: retentionPayload,
    retentionSeconds: 3600,
    retries: 2,
  },
  {
    name: PLATFORM_JOBS.subjectErasure,
    payload: erasurePayload,
    retentionSeconds: 86_400,
    retries: 2,
  },
]);

/** Trusted worker-only handlers; these are never registered as HTTP erasure or migration bypasses. */
export function createPlatformJobHandlers(
  deps: InstanceDependencies,
  scheduling?: MaintenanceScheduling,
  notifications?: NotificationDeliveryOptions,
): readonly QueueJobHandler[] {
  const persistence = instancePersistence(deps, 'system');
  const execution = (tx: TenantTransaction, type: string) =>
    deps.runtime.forTenant(tx).execution(type);
  return [
    createNotificationDispatchHandler(deps.registry, scheduling?.queue),
    ...createNotificationDeliveryHandlers(deps, scheduling?.queue, notifications),
    ...createTenantMaintenanceHandlers(deps, scheduling),
    {
      name: PLATFORM_JOBS.instanceMigration,
      async runInTransaction(this: void, tx: TenantTransaction, input: unknown) {
        const data = migrationPayload.parse(input);
        if (!tx.context.projectId) throw new AppError('not_found');
        await tx.repositories.projects.get(tx.context.projectId, { lock: true });
        const module = deps.registry.get(data.moduleType);
        if (!module) return;
        const instance = await tx.repositories.instances.getByKey(module.type, data.key);
        // A queued migration never overwrites a newer edit or restores an archived instance.
        if (
          instance.status === 'archived' ||
          instance.configVersion !== data.configVersion ||
          instance.moduleVersion >= module.moduleVersion
        )
          return;
        await persistence.save(
          tx,
          module,
          instance,
          { config: validatedConfig(module, instance.config, instance.moduleVersion) },
          undefined,
          'instance.migrated',
        );
      },
    },
    {
      name: PLATFORM_JOBS.retentionPurge,
      async runInTransaction(this: void, tx: TenantTransaction, input: unknown) {
        const data = retentionPayload.parse(input);
        if (!tx.context.projectId) throw new AppError('not_found');
        let count = 0;
        let full = false;
        for (const module of deps.registry.modules) {
          // oxlint-disable-next-line no-await-in-loop -- Module hooks share this tenant transaction.
          const purged = await module.retention.purgeExpired(execution(tx, module.type), {
            now: deps.clock.now(),
            limit: MAX_MAINTENANCE_BATCH,
          });
          count += purged;
          full ||= purged === MAX_MAINTENANCE_BATCH;
        }
        if (count)
          await deps.audit.record(tx, {
            actorType: 'system',
            action: 'retention.purged',
            changes: { count },
          });
        const round = data.round ?? 1;
        if (full && data.runId && scheduling && round < MAX_RETENTION_ROUNDS)
          await scheduling.queue.enqueue(
            tx,
            PLATFORM_JOBS.retentionPurge,
            { runId: data.runId, round: round + 1 },
            { singletonKey: `${data.runId}:${round + 1}` },
          );
      },
    },
    {
      name: PLATFORM_JOBS.subjectErasure,
      async runInTransaction(this: void, tx: TenantTransaction, input: unknown) {
        const data = erasurePayload.parse(input);
        if (!tx.context.projectId) throw new AppError('not_found');
        let count = 0;
        for (const module of deps.registry.modules) {
          // oxlint-disable-next-line no-await-in-loop -- All module erasure effects enlist in one transaction.
          count += await module.privacy.deleteSubject(execution(tx, module.type), data.email);
        }
        await deps.audit.record(tx, {
          actorType: 'system',
          action: 'privacy.module_subject_erased',
          changes: { count },
        });
      },
    },
  ];
}
