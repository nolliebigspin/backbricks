import { AppError, systemJobPayloadSchema } from '@backbricks/core';
import type { PgBoss } from 'pg-boss';

/** Trusted host callbacks only; module Queue capabilities cannot enqueue these global tasks. */
export function createQueueSchedules(boss: PgBoss, report: (name: string) => void) {
  return {
    async scheduleSystem(name: string, cron: string, run: () => Promise<void>) {
      if (!/^core\.[a-z][a-z0-9_.]+$/.test(name)) throw new AppError('invalid_request');
      const policy = {
        policy: 'stately' as const,
        retryLimit: 2,
        retryDelay: 1,
        retryBackoff: true,
        expireInSeconds: 60,
        retentionSeconds: 3600,
        deleteAfterSeconds: 3600,
      };
      await boss.createQueue(name, policy);
      const { policy: _creationPolicy, ...settings } = policy;
      await boss.updateQueue(name, settings);
      await boss.work<unknown>(
        name,
        { batchSize: 1, localConcurrency: 1, pollingIntervalSeconds: 0.5 },
        async (jobs) => {
          const job = jobs[0];
          if (!job) return;
          try {
            systemJobPayloadSchema.parse(job.data);
            await run();
          } catch {
            report(name);
            throw new Error('Scheduled operation failed.');
          }
        },
      );
      await boss.schedule(name, cron, {});
    },
  };
}
