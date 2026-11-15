import { expect, test } from 'bun:test';

import {
  createIds,
  monthlyUsagePeriod,
  PLATFORM_JOBS,
  queueEnvelopeSchema,
} from '@backbricks/core';

import { scenario } from '../test/auth-fixture.ts';
import { prepareUploads, uploadsAvailable, uploadsEnvironment } from '../test/uploads-fixture.ts';

test.skipIf(!uploadsAvailable)(
  'concurrent retention discovers more than one bounded batch without double audit or usage accounting',
  async () => {
    let shift = 0;
    await scenario(
      async (base) => {
        const f = await prepareUploads(base);
        try {
          const seed = await f.intent();
          await f.put(seed);
          expect((await f.complete(seed)).status).toBe(200);
          const row = await f.use(async (tx) => tx.modules.uploads?.get(seed.fileId, f.now()));
          if (!row) throw new Error('Missing seed');
          const ids = createIds({ now: f.now });
          await f.use(async (tx) => {
            const repository = tx.modules.uploads;
            if (!repository) throw new Error('Missing repository');
            for (let index = 0; index < 104; index++) {
              const id = ids.generate('file');
              // oxlint-disable-next-line no-await-in-loop -- Real storage rows share one physical transaction connection.
              await repository.insert({
                ...row,
                id,
                uploadHandle: null,
                stagingKey: `stg/${row.organizationId}/${row.projectId}/${id}`,
                storageKey: `fil/${row.organizationId}/${row.projectId}/${id}`,
              });
            }
          });
          const period = monthlyUsagePeriod(f.now());
          const before = await f.use((tx) => tx.repositories.usage.list(period));
          shift = 86_400_001;
          const purge = f.jobs().find((job) => job.name === PLATFORM_JOBS.retentionPurge);
          if (!purge) throw new Error('Missing retention handler');
          const runId = crypto.randomUUID();
          await Promise.all([purge.run(f.scope, { runId }), purge.run(f.scope, { runId })]);
          expect(
            (
              await f.db.execute<{ count: string }>(
                'select count(*)::text as count from files where deleted_at is not null',
              )
            ).rows[0]?.count,
          ).toBe('105');
          expect(
            (
              await f.db.execute<{ count: string }>(
                "select count(*)::text as count from audit_logs where action = 'uploads.file.deleted'",
              )
            ).rows[0]?.count,
          ).toBe('105');
          const audits = (
            await f.db.execute<{ changes: { count: number } }>(
              "select changes from audit_logs where action = 'retention.purged' order by created_at",
            )
          ).rows;
          expect(audits.map((audit) => audit.changes.count)).toEqual([100, 5]);
          const continuations = (
            await f.db.execute<{ data: unknown }>(
              `select data from pgboss.job where name = '${PLATFORM_JOBS.retentionPurge}'`,
            )
          ).rows;
          expect(continuations).toHaveLength(1);
          expect(queueEnvelopeSchema.parse(continuations[0]?.data).payload).toMatchObject({
            runId,
            round: 2,
          });
          expect(await f.use((tx) => tx.repositories.usage.list(period))).toEqual(before);
          expect(await f.storage.head(row.stagingKey)).not.toBeNull();
        } finally {
          await f.cleanup();
        }
      },
      uploadsEnvironment,
      {
        durableDelivery: true,
        consumeJobs: false,
        keyClock: { now: () => new Date(Date.now() + shift) },
      },
    );
  },
  30_000,
);
