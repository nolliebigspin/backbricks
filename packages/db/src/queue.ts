import {
  AppError,
  systemClock,
  type Clock,
  type EventRecord,
  type TenantTransaction,
  QUEUE_STOP_TIMEOUT_MS,
  queueEnvelopeSchema,
  queueJobDefinitionSchema,
  type Queue,
  type QueueJobDefinition,
  type QueueJobHandler,
  type WithTenant,
  jsonValueSchema,
} from '@backbricks/core';
import { sql } from 'drizzle-orm';
import { PgBoss, fromDrizzle } from 'pg-boss';

import { databasePool, type Database } from './client.ts';
import { queueSingletonId } from './queue-identities.ts';
import { createMailQueue } from './queue-mail.ts';
import { createQueueSchedules } from './queue-schedules.ts';
import { securityRecipients } from './repositories/security-recipients.ts';
import { transactionFor } from './transaction-binding.ts';

const WORKER_CONCURRENCY = 2;
const WORKER_POLL_INTERVAL_SECONDS = 0.5;
const JOB_TIMEOUT_SECONDS = 60;
const RETRY_DELAY_SECONDS = 1;

/** PostgreSQL owns the opaque-handle binding so no driver crosses the core/module boundary. */
export function createPostgresQueue(
  db: Database,
  definitions: readonly QueueJobDefinition[],
  report: (name: string) => void = () => {},
  clock: Clock = systemClock,
) {
  const registered = new Map(
    definitions.map((definition) => {
      const { payload, ...policy } = definition;
      return [definition.name, { ...queueJobDefinitionSchema.parse(policy), payload }] as const;
    }),
  );
  if (registered.size !== definitions.length) throw new AppError('invalid_request');
  const boss = new PgBoss({
    db: { executeSql: (text, values) => databasePool(db).query(text, values) },
  });
  boss.on('error', () => report('core.queue'));
  boss.on('warning', () => report('core.queue_warning'));
  let started = false;
  const mail = createMailQueue(
    boss,
    clock,
    report,
    () => started,
    async (organizationId, to) => (await securityRecipients(db, organizationId)).includes(to),
  );
  const schedules = createQueueSchedules(boss, report);
  const queue: Queue = {
    async enqueue(tx, name, input, options) {
      if (!started) throw new AppError('service_unavailable');
      const definition = registered.get(name);
      if (!definition) throw new AppError('invalid_request');
      const payload = definition.payload.safeParse(input);
      if (!payload.success) throw new AppError('validation_failed');
      const wire = jsonValueSchema.safeParse(input);
      if (!wire.success) throw new AppError('validation_failed');
      const envelope = queueEnvelopeSchema.parse({
        organizationId: tx.context.organizationId,
        projectId: tx.context.projectId,
        payload: wire.data,
      });
      return boss.send(name, envelope, {
        db: fromDrizzle(transactionFor(tx), sql),
        startAfter: options?.notBefore,
        ...(options?.singletonKey
          ? {
              id: queueSingletonId([
                envelope.organizationId,
                envelope.projectId ?? '',
                name,
                options.singletonKey,
              ]),
            }
          : {}),
      });
    },
  };
  return {
    ...mail,
    ...schedules,
    queue,
    async enqueueEvent(
      this: void,
      tx: TenantTransaction,
      event: EventRecord,
      name: string,
      payload: unknown,
    ) {
      const definition = registered.get(name);
      if (!started || !definition) throw new AppError('service_unavailable');
      if (
        event.organizationId !== tx.context.organizationId ||
        (tx.context.projectId && tx.context.projectId !== event.projectId)
      )
        throw new AppError('not_found');
      if (!definition.payload.safeParse(payload).success) throw new AppError('validation_failed');
      return boss.send(
        name,
        queueEnvelopeSchema.parse({
          organizationId: event.organizationId,
          projectId: event.projectId ?? undefined,
          payload,
        }),
        { id: queueSingletonId([event.id, name]), db: fromDrizzle(transactionFor(tx), sql) },
      );
    },
    async start() {
      await boss.start();
      try {
        await Promise.all(
          [...registered.values()].map(async (definition) => {
            const policy = {
              retryLimit: definition.retries,
              retryDelay: RETRY_DELAY_SECONDS,
              retryBackoff: true,
              expireInSeconds: JOB_TIMEOUT_SECONDS,
              retentionSeconds: definition.retentionSeconds,
              deleteAfterSeconds: definition.retentionSeconds,
            };
            await boss.createQueue(definition.name, policy);
            await boss.updateQueue(definition.name, policy);
          }),
        );
        await mail.startMail();
        started = true;
      } catch (error) {
        await boss.stop({ graceful: true, close: false });
        throw error;
      }
    },
    async consume(handlers: readonly QueueJobHandler[], withTenant: WithTenant) {
      await Promise.all(
        handlers.map(async (handler) => {
          const definition = registered.get(handler.name);
          if (!definition) throw new AppError('invalid_request');
          await boss.work<unknown>(
            handler.name,
            {
              localConcurrency: WORKER_CONCURRENCY,
              batchSize: 1,
              pollingIntervalSeconds: WORKER_POLL_INTERVAL_SECONDS,
            },
            async (jobs) => {
              const job = jobs[0];
              if (!job) return;
              try {
                const envelope = queueEnvelopeSchema.parse(job.data);
                definition.payload.parse(envelope.payload);
                await withTenant(
                  { organizationId: envelope.organizationId, projectId: envelope.projectId },
                  async (tx) => {
                    await handler.runInTransaction(tx, envelope.payload);
                    await boss.complete(handler.name, job.id, null, {
                      db: fromDrizzle(transactionFor(tx), sql),
                    });
                  },
                );
              } catch {
                report(handler.name);
                throw new Error('Registered job execution failed.');
              }
            },
          );
        }),
      );
    },
    async stop() {
      try {
        await boss.stop({ graceful: true, timeout: QUEUE_STOP_TIMEOUT_MS, close: false });
      } finally {
        started = false;
      }
    },
  };
}
