import { expect, test } from 'bun:test';

import { PLATFORM_JOBS, queueEnvelopeSchema } from '@backbricks/core';
import { createWithTenant } from '@backbricks/db';

import { scenario } from '../test/auth-fixture.ts';
import { createProjectUploadIntent } from '../test/isolation/uploads-cases.ts';
import { prepareUploads, uploadsAvailable, uploadsEnvironment } from '../test/uploads-fixture.ts';

test.skipIf(!uploadsAvailable)(
  'scheduled maintenance recovers a lost late-staging cleanup job without touching the ready final copy',
  async () => {
    let shift = 0;
    await scenario(
      async (base) => {
        const f = await prepareUploads(base);
        try {
          const file = await f.ready();
          const row = await f.use(async (tx) => tx.modules.uploads?.get(file.fileId, f.now()));
          if (!row) throw new Error('Missing file');
          // Trusted fixture PUT simulates a legacy/out-of-band staging object; public sessions are consumed.
          const legacy = await f.storage.presignPut({
            key: row.stagingKey,
            size: file.bytes.length,
            contentType: 'application/pdf',
            expiresInSeconds: 300,
          });
          expect(
            (await fetch(legacy.url, { method: 'PUT', headers: legacy.headers, body: file.bytes }))
              .status,
          ).toBe(200);
          await f.db.execute("delete from pgboss.job where name = 'uploads.cleanup-file'");
          shift = 360_000;
          const purge = f.jobs().find((job) => job.name === PLATFORM_JOBS.retentionPurge);
          const cleanup = f.jobs().find((job) => job.name === 'uploads.cleanup-file');
          if (!purge || !cleanup) throw new Error('Missing maintenance handlers');
          await purge.run(f.scope, { runId: crypto.randomUUID() });
          expect(
            (
              await f.db.execute<{ data: unknown }>(
                "select data from pgboss.job where name = 'uploads.cleanup-file'",
              )
            ).rows,
          ).toHaveLength(1);
          await cleanup.run(f.scope, { fileId: file.fileId });
          expect(await f.storage.head(row.stagingKey)).toBeNull();
          expect(await f.storage.head(row.storageKey)).not.toBeNull();
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

test.skipIf(!uploadsAvailable)(
  'scheduled maintenance restores stalled scan deliveries without duplicating accepted usage',
  async () => {
    let shift = 0;
    await scenario(
      async (base) => {
        const f = await prepareUploads(base);
        try {
          const file = await f.intent();
          await f.put(file);
          await f.complete(file);
          await f.db.execute("delete from pgboss.job where name = 'uploads.scan'");
          shift = 180_000;
          const purge = f.jobs().find((job) => job.name === PLATFORM_JOBS.retentionPurge);
          const scan = f.jobs().find((job) => job.name === 'uploads.scan');
          if (!purge || !scan) throw new Error('Missing handlers');
          await purge.run(f.scope, { runId: crypto.randomUUID() });
          const jobs = (
            await f.db.execute<{ data: unknown }>(
              "select data from pgboss.job where name = 'uploads.scan'",
            )
          ).rows;
          expect(jobs).toHaveLength(1);
          const payload = queueEnvelopeSchema.parse(jobs[0]?.data).payload;
          expect(payload).toMatchObject({ fileId: file.fileId, attempt: 0 });
          await scan.run(f.scope, payload);
          expect(
            (await f.use(async (tx) => tx.modules.uploads?.get(file.fileId, f.now())))?.status,
          ).toBe('ready');
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

test.skipIf(!uploadsAvailable)(
  'archived projects and zones purge 24-hour orphans with unlimited retention, without erasure authority or foreign effects',
  async () => {
    let shift = 0;
    await scenario(
      async (base) => {
        const f = await prepareUploads(base, { retentionDays: null });
        let neighbourKey: string | undefined;
        try {
          const ready = await f.ready();
          const pending = await f.intent();
          await f.put(pending);
          const neighbour = await createProjectUploadIntent(
            f,
            f.a2,
            f.owner,
            pending.bytes.byteLength,
          );
          expect(
            (
              await fetch(neighbour.uploadUrl, {
                method: 'PUT',
                headers: neighbour.headers,
                body: pending.bytes,
              })
            ).status,
          ).toBe(200);
          expect((await neighbour.complete()).status).toBe(200);
          neighbourKey = `stg/${f.a2.organizationId}/${f.a2.id}/${neighbour.fileId}`;
          const files = await f.use(async (tx) => {
            const repo = tx.modules.uploads;
            if (!repo) throw new Error('Missing repository');
            return Promise.all([
              repo.get(ready.fileId, f.now()),
              repo.get(pending.fileId, f.now()),
            ]);
          });
          expect(
            (
              await f.request(
                `${f.zonePath}/cv?configVersion=1`,
                undefined,
                f.owner.cookie,
                undefined,
                'DELETE',
              )
            ).status,
          ).toBe(204);
          expect(
            (
              await f.request(
                `/v1/projects/${f.a1.id}`,
                undefined,
                f.owner.cookie,
                undefined,
                'DELETE',
              )
            ).status,
          ).toBe(204);
          shift = 86_400_001;
          const fanout = f.jobs().find((job) => job.name === PLATFORM_JOBS.maintenanceFanout);
          const project = f.jobs().find((job) => job.name === PLATFORM_JOBS.projectMaintenance);
          const purge = f.jobs().find((job) => job.name === PLATFORM_JOBS.retentionPurge);
          const cleanup = f.jobs().find((job) => job.name === 'uploads.cleanup-file');
          if (!fanout || !project || !purge || !cleanup)
            throw new Error('Missing maintenance handlers');
          const runId = crypto.randomUUID();
          await fanout.run({ organizationId: f.organizationId }, { runId });
          const intents = (
            await f.db.execute<{ data: unknown }>(
              `select data from pgboss.job where name = '${PLATFORM_JOBS.projectMaintenance}' and data->>'projectId' = '${f.a1.id}'`,
            )
          ).rows;
          expect(intents).toHaveLength(1);
          const envelope = queueEnvelopeSchema.parse(intents[0]?.data);
          expect(envelope.archivedMaintenance).toBe(true);
          expect(envelope.archivedProject).toBeUndefined();
          const context = { ...f.scope, archivedMaintenance: true as const };
          await project.run(context, { runId });
          await Promise.all([purge.run(context, { runId }), purge.run(context, { runId })]);
          expect(
            (
              await f.db.execute<{ n: string }>(
                "select count(*)::text as n from audit_logs where action = 'uploads.file.deleted'",
              )
            ).rows[0]?.n,
          ).toBe('2');
          expect(
            await createWithTenant(f.db)(context, (tx) =>
              tx.repositories.projects.eraseRecords(),
            ).catch((error: unknown) => error),
          ).toBeInstanceOf(Error);
          for (const file of files) {
            // oxlint-disable-next-line no-await-in-loop -- Each confirmed deletion has its own transaction after discovery commits.
            await cleanup.run(context, { fileId: file.id });
            // oxlint-disable-next-line no-await-in-loop -- Verify both private keys rather than infer physical cleanup from SQL.
            expect(await f.storage.head(file.stagingKey)).toBeNull();
            // oxlint-disable-next-line no-await-in-loop -- See above.
            expect(await f.storage.head(file.storageKey)).toBeNull();
          }
          expect(
            (
              await f.db.execute<{ id: string }>(
                `select id from files where project_id = '${f.a1.id}'`,
              )
            ).rows,
          ).toEqual([]);
          expect(
            (
              await f.db.execute<{ deleted_at: unknown }>(
                `select deleted_at from files where id = '${neighbour.fileId}'`,
              )
            ).rows[0]?.deleted_at,
          ).toBeNull();
          expect(await f.storage.head(neighbourKey)).not.toBeNull();
        } finally {
          if (neighbourKey) await f.storage.delete(neighbourKey);
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
