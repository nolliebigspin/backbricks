import { z } from 'zod';

import { AppError } from '../errors/app-error.ts';
import { pageQuerySchema, pageResult, repositoryPage } from '../http/pagination.ts';
import { MAX_MAINTENANCE_BATCH, type QueueJobHandler } from '../jobs/contract.ts';
import { outboxJobPayloadSchema } from '../jobs/outbox.ts';
import { PLATFORM_JOBS } from '../jobs/platform-names.ts';
import type { ModuleRegistry } from '../modules/registry.ts';
import { activityIdentifierSchema } from '../platform/activity-fields.ts';
import type { Queue } from '../services/providers.ts';

/** Shared structural outbox envelope plus the opaque continuation position for bounded rule pages. */
export const notificationDispatchPayloadSchema = outboxJobPayloadSchema.extend({
  cursor: pageQuerySchema.shape.cursor,
});
/** Delivery resolves the current rule, membership and source at send time; the queue holds IDs only. */
export const notificationDeliveryPayloadSchema = z
  .object({
    ruleId: activityIdentifierSchema,
    eventId: activityIdentifierSchema,
    instanceId: activityIdentifierSchema,
    subjectId: activityIdentifierSchema,
  })
  .strict();
export const NOTIFICATION_JOB_DEFINITIONS = Object.freeze([
  {
    name: PLATFORM_JOBS.notificationDispatch,
    payload: notificationDispatchPayloadSchema,
    retries: 3,
    retentionSeconds: 86_400,
  },
  // The delivery worker is implemented in P2.6b; pending jobs already have bounded retention.
  {
    name: PLATFORM_JOBS.notificationDelivery,
    payload: notificationDeliveryPayloadSchema,
    retries: 3,
    retentionSeconds: 86_400,
  },
]);

/** Generic, bounded rule fan-out. Completion and all child enqueues share one scoped transaction. */
export function createNotificationDispatchHandler(
  registry: ModuleRegistry,
  queue?: Queue,
): QueueJobHandler {
  const eventModules = new Map(
    registry.modules.flatMap((module) =>
      module.events.map((event) => [event.name, module.type] as const),
    ),
  );
  return {
    name: PLATFORM_JOBS.notificationDispatch,
    consumes: [...eventModules.keys()],
    async runInTransaction(tx, input) {
      const data = notificationDispatchPayloadSchema.parse(input);
      const moduleType = eventModules.get(data.event.type);
      if (!moduleType) return;
      if (!tx.context.projectId) throw new AppError('not_found');
      const instanceId = data.event.payload['instanceId'];
      if (typeof instanceId !== 'string' || !data.event.subjectId) return;
      const project = await tx.repositories.projects.get(tx.context.projectId, { lock: true });
      if (project.deletedAt) return;
      const instance = await tx.repositories.instances.get(instanceId).catch((error: unknown) => {
        if (error instanceof AppError && error.code === 'not_found') return null;
        throw error;
      });
      if (!instance || instance.status === 'archived' || instance.moduleType !== moduleType) return;
      if (!queue) throw new AppError('service_unavailable');
      const page = pageResult(
        await tx.repositories.notificationRules.matching(
          data.event.type,
          instance.id,
          repositoryPage({ limit: MAX_MAINTENANCE_BATCH, cursor: data.cursor }),
        ),
        MAX_MAINTENANCE_BATCH,
      );
      for (const rule of page.data) {
        // oxlint-disable-next-line no-await-in-loop -- All enqueues must enlist in the current transaction.
        await queue.enqueue(
          tx,
          PLATFORM_JOBS.notificationDelivery,
          {
            ruleId: rule.id,
            eventId: data.event.id,
            instanceId: instance.id,
            subjectId: data.event.subjectId,
          },
          { singletonKey: `${data.event.id}:${rule.id}` },
        );
      }
      if (page.nextCursor)
        await queue.enqueue(
          tx,
          PLATFORM_JOBS.notificationDispatch,
          {
            ...data,
            cursor: page.nextCursor,
          },
          { singletonKey: `${data.event.id}:${page.nextCursor}` },
        );
    },
  };
}
