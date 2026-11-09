import {
  AppError,
  systemClock,
  type Clock,
  type EventRecord,
  type TenantTransaction,
  type TenantContext,
  type ProjectJobEnqueue,
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

import { databasePool, type Database, type DbTransaction } from './client.ts';
import { createQueueCleanup } from './queue-cleanup.ts';
import { QUEUE_SCHEMA } from './queue-constants.ts';
import { queueSingletonId } from './queue-identities.ts';
import { createMailQueue } from './queue-mail.ts';
import { createQueueSchedules } from './queue-schedules.ts';
import { createMaintenanceRepository } from './repositories/maintenance.ts';
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
    schema: QUEUE_SCHEMA,
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
  async function send(
    tx: DbTransaction,
    context: TenantContext,
    name: string,
    input: unknown,
    options?: Parameters<Queue['enqueue']>[3],
    id?: string,
  ) {
    if (!started) throw new AppError('service_unavailable');
    const definition = registered.get(name);
    if (!definition) throw new AppError('invalid_request');
    if (!definition.payload.safeParse(input).success) throw new AppError('validation_failed');
    const wire = jsonValueSchema.safeParse(input);
    if (!wire.success) throw new AppError('validation_failed');
    const envelope = queueEnvelopeSchema.parse({
      organizationId: context.organizationId,
      projectId: context.projectId,
      payload: wire.data,
    });
    return boss.send(name, envelope, {
      db: fromDrizzle(tx, sql),
      startAfter: options?.notBefore,
      ...(id
        ? { id }
        : options?.singletonKey
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
  }
  const queue: Queue = {
    enqueue: async (tx, name, input, options) =>
      send(transactionFor(tx), tx.context, name, input, options),
  };
  const enqueueProject: ProjectJobEnqueue = async (tx, input) => {
    if (tx.context.projectId && tx.context.projectId !== input.projectId)
      throw new AppError('not_found');
    await tx.repositories.projects.get(input.projectId);
    return send(
      transactionFor(tx),
      { organizationId: tx.context.organizationId, projectId: input.projectId },
      input.name,
      input.payload,
      { singletonKey: input.singletonKey },
    );
  };

  return {
    maintenance: createMaintenanceRepository(db),
    purgeExpiredJobs: createQueueCleanup(db),
    ...mail,
    ...schedules,
    queue,
    enqueueProject,
    async enqueueEvent(
      this: void,
      tx: TenantTransaction,
      event: EventRecord,
      name: string,
      payload: unknown,
    ) {
      if (
        event.organizationId !== tx.context.organizationId ||
        (tx.context.projectId && tx.context.projectId !== event.projectId)
      )
        throw new AppError('not_found');
      return send(
        transactionFor(tx),
        { organizationId: event.organizationId, projectId: event.projectId ?? undefined },
        name,
        payload,
        undefined,
        queueSingletonId([event.id, name]),
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
