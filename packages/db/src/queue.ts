import { createHash } from 'node:crypto';

import {
  AppError,
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
import { transactionFor } from './transaction-binding.ts';

const WORKER_CONCURRENCY = 2;
const WORKER_POLL_INTERVAL_SECONDS = 0.5;
const JOB_TIMEOUT_SECONDS = 60;
const RETRY_DELAY_SECONDS = 1;
const singletonId = (value: string) => {
  const hex = createHash('sha256').update(value).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};

/** PostgreSQL owns the opaque-handle binding so no driver crosses the core/module boundary. */
export function createPostgresQueue(
  db: Database,
  definitions: readonly QueueJobDefinition[],
  report: (name: string) => void = () => {},
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
              id: singletonId(
                `${envelope.organizationId}:${envelope.projectId ?? ''}:${name}:${options.singletonKey}`,
              ),
            }
          : {}),
      });
    },
  };
  return {
    queue,
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
