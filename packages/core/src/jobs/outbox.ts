import { z } from 'zod';

import { AppError } from '../errors/app-error.ts';
import { activityIdentifierSchema, activityNameSchema } from '../platform/activity-fields.ts';
import type { EventRecord } from '../platform/models.ts';
import { activityMetadataSchema } from '../services/activity.ts';
import { CORE_EVENTS } from '../services/event-types.ts';
import type { TenantTransaction } from '../tenancy/tenant-context.ts';
import type { Clock } from '../time/clock.ts';

/** Consumers receive public structural metadata; no auth delivery tokens enter the outbox. */
export const outboxJobPayloadSchema = z
  .object({
    event: z
      .object({
        id: activityIdentifierSchema,
        type: activityNameSchema,
        subjectType: activityNameSchema.nullable(),
        subjectId: activityIdentifierSchema.nullable(),
        payload: activityMetadataSchema,
        createdAt: z.iso.datetime(),
      })
      .strict(),
  })
  .strict();
export type OutboxConsumer = Readonly<{ name: string; types: readonly string[] }>;

/** Claim, consumer enqueue and marker updates all use the supplied scoped transaction. */
export function createOutboxDispatcher(deps: {
  clock: Clock;
  consumers: readonly OutboxConsumer[];
  enqueue(
    tx: TenantTransaction,
    event: EventRecord,
    consumer: string,
    payload: z.infer<typeof outboxJobPayloadSchema>,
  ): Promise<unknown>;
  security?: (tx: TenantTransaction, event: EventRecord) => Promise<void>;
}) {
  return async (tx: TenantTransaction, limit: number) => {
    const events = await tx.repositories.events.pending(limit, {
      excludeTypes: deps.security ? [] : [CORE_EVENTS.secretKeyExposed],
      validAt: deps.clock.now(),
    });
    for (const event of events) {
      if (event.organizationId !== tx.context.organizationId) throw new AppError('not_found');
      const payload = outboxJobPayloadSchema.parse({
        event: {
          id: event.id,
          type: event.type,
          subjectType: event.subjectType,
          subjectId: event.subjectId,
          payload: event.payload,
          createdAt: event.createdAt.toISOString(),
        },
      });
      for (const consumer of deps.consumers.filter((candidate) =>
        candidate.types.includes(event.type),
      )) {
        // oxlint-disable-next-line no-await-in-loop -- Preserve one caller transaction and deterministic consumer order.
        await deps.enqueue(tx, event, consumer.name, payload);
      }
      if (event.type === CORE_EVENTS.secretKeyExposed) {
        // oxlint-disable-next-line no-await-in-loop -- Security delivery is enlisted before this event's marker.
        await deps.security?.(tx, event);
      }
      // oxlint-disable-next-line no-await-in-loop -- A marker follows all enqueues for this locked event.
      await tx.repositories.events.markDispatched(event.id, deps.clock.now());
    }
    return events.length;
  };
}
