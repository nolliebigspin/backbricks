import { expect, test } from 'bun:test';

import { createIds, hashApiKey, PLATFORM_JOBS } from '@backbricks/core';

import { startSlowPut } from '../../../scripts/test/slow-put.ts';
import { attachmentsEnvironment, prepareAttachments } from '../test/attachments-fixture.ts';
import { scenario } from '../test/auth-fixture.ts';
import { createProjectUploadIntent } from '../test/isolation/uploads-cases.ts';
import { assertProjectDataGone } from '../test/project-erasure-fixture.ts';
import { createStorageProxy } from '../test/storage-proxy.ts';
import { uploadsAvailable } from '../test/uploads-fixture.ts';

test.skipIf(!uploadsAvailable)(
  'project erasure removes more than one batch of real objects, settles an in-flight part and survives rollback/outage without affecting a neighbour',
  async () => {
    const proxy = createStorageProxy();
    let shift = 0;
    try {
      await scenario(
        async (base) => {
          const f = await prepareAttachments(base, {
            limits: { perMinute: 1000, perHour: 10_000 },
          });
          let slow: ReturnType<typeof startSlowPut> | undefined;
          let sessionControl: { key: string; handle: string } | undefined;
          try {
            const files = [await f.ready('private-000.pdf')];
            for (let index = 1; index < 105; index++) {
              // oxlint-disable-next-line no-await-in-loop -- Every file traverses actual intent/PUT/completion/copy/inspection transactions.
              files.push(await f.ready(`private-${String(index).padStart(3, '0')}.pdf`));
            }
            expect((await f.submit([files[0]!.fileRef])).status).toBe(200);
            const rows = await f.use(async (tx) => {
              const result = [];
              for (const file of files) {
                // oxlint-disable-next-line no-await-in-loop -- One transaction connection executes each scoped read in order.
                result.push(await tx.modules.uploads!.get(file.fileId, f.now()));
              }
              return result;
            });
            expect(
              (await Promise.all(rows.map((row) => f.storage.head(row.storageKey)))).filter(
                Boolean,
              ),
            ).toHaveLength(105);
            const neighbour = await createProjectUploadIntent(
              f,
              f.a2,
              f.owner,
              files[0]!.bytes.length,
            );
            expect(
              (
                await fetch(neighbour.uploadUrl, {
                  method: 'PUT',
                  headers: neighbour.headers,
                  body: files[0]!.bytes,
                })
              ).status,
            ).toBe(200);
            expect((await neighbour.complete()).status).toBe(200);
            const scan = f.jobs().find((job) => job.name === 'uploads.scan');
            const erase = f.jobs().find((job) => job.name === PLATFORM_JOBS.projectErasure);
            const cleanup = f.jobs().find((job) => job.name === 'uploads.cleanup-file');
            if (!scan || !erase || !cleanup) throw new Error('Missing workers');
            await scan.run(
              { organizationId: f.a2.organizationId, projectId: f.a2.id },
              { fileId: neighbour.fileId },
            );
            const neighbourKey = `fil/${f.a2.organizationId}/${f.a2.id}/${neighbour.fileId}`;
            expect(await f.storage.head(neighbourKey)).not.toBeNull();

            // A short real provider session makes the expiry-spanning request deterministic without a five-minute wall wait.
            const ids = createIds({ now: f.now });
            const pendingId = ids.generate('file');
            const seed = rows[0]!;
            const stagingKey = `stg/${f.organizationId}/${f.a1.id}/${pendingId}`;
            const storageKey = `fil/${f.organizationId}/${f.a1.id}/${pendingId}`;
            const createdAt = f.now();
            const session = await f.storage.createUploadSession({
              key: stagingKey,
              size: 2,
              contentType: 'application/pdf',
              expiresInSeconds: 2,
            });
            sessionControl = { key: stagingKey, handle: session.handle };
            await f.use(async (tx) =>
              tx.modules.uploads!.insert({
                id: pendingId,
                instanceId: seed.instanceId,
                configVersion: seed.configVersion,
                stagingKey,
                storageKey,
                originalName: 'private-pending.pdf',
                declaredMime: 'application/pdf',
                sizeBytes: 2,
                uploadTokenHash: await hashApiKey('fixture-only-pending-token'),
                uploadHandle: session.handle,
                uploadExpiresAt: new Date(createdAt.getTime() + 2000),
                metadata: { note: 'private pending metadata' },
                isTest: false,
                createdAt,
                updatedAt: createdAt,
                expiresAt: new Date(createdAt.getTime() + 86_400_000),
              }),
            );
            await f.trackIntent({ fileId: pendingId });
            slow = startSlowPut(session.url, session.headers, '%');
            await slow.started;
            expect(
              await Promise.race([slow.response.then(() => false), Bun.sleep(50).then(() => true)]),
            ).toBe(true);

            // A previously active child still holds private data and must be purged during finalization.
            expect(
              (
                await f.request(
                  `/v1/projects/${f.a1.id}/privacy/subject-delete`,
                  { email: 'person@example.test' },
                  f.admin.cookie,
                )
              ).status,
            ).toBe(202);
            await f.db.execute(
              `update pgboss.job set state = 'active' where name = '${PLATFORM_JOBS.subjectErasure}' and data->>'projectId' = '${f.a1.id}'`,
            );
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
            expect(
              (
                await f.request(
                  '/v1/project-erasures',
                  { projectId: f.a1.id, confirm: f.a1.slug },
                  f.owner.cookie,
                )
              ).status,
            ).toBe(202);
            const context = { ...f.scope, archivedProject: true as const };
            const erasedAt = async () =>
              (
                await f.db.execute<{ erased_at: unknown }>(
                  `select erased_at from projects where id = '${f.a1.id}'`,
                )
              ).rows[0]?.erased_at;
            const marked = async () =>
              (
                await f.db.execute<{ n: number }>(
                  `select count(*)::int as n from files where project_id = '${f.a1.id}' and deleted_at is not null`,
                )
              ).rows[0]?.n;
            await f.db.execute(
              "alter table audit_logs add constraint fixture_project_marker_audit check (action <> 'uploads.file.deleted') not valid",
            );
            expect(await erase.run(context, {}).catch((error: unknown) => error)).toBeInstanceOf(
              Error,
            );
            await f.db.execute(
              'alter table audit_logs drop constraint fixture_project_marker_audit',
            );
            expect(await marked()).toBe(0);
            await f.db.execute(
              "alter table pgboss.job add constraint fixture_project_marker_queue check (name <> 'uploads.cleanup-file') not valid",
            );
            expect(await erase.run(context, {}).catch((error: unknown) => error)).toBeInstanceOf(
              Error,
            );
            await f.db.execute(
              'alter table pgboss.job drop constraint fixture_project_marker_queue',
            );
            expect(await marked()).toBe(0);
            expect(await f.storage.head(seed.storageKey)).not.toBeNull();

            proxy.unavailable(true);
            await erase.run(context, {});
            expect(await marked()).toBe(100);
            expect(await erasedAt()).toBeNull();
            await cleanup.run(context, { fileId: seed.id });
            expect(await f.storage.head(seed.storageKey)).not.toBeNull();
            const retry = (
              await f.db.execute<{ cleanup_attempts: number; cleanup_after: string }>(
                `select cleanup_attempts, cleanup_after from files where id = '${seed.id}'`,
              )
            ).rows[0];
            expect(retry?.cleanup_attempts).toBe(1);
            expect(new Date(retry!.cleanup_after).getTime()).toBeGreaterThan(f.now().getTime());
            await erase.run(context, { round: 2 });
            expect(await erasedAt()).toBeNull();
            proxy.unavailable(false);
            shift = 301_000;
            for (const row of rows.slice(0, 100)) {
              // oxlint-disable-next-line no-await-in-loop -- Physical cleanup uses a fresh committed frame for each tracked object.
              await cleanup.run(context, { fileId: row.id });
            }
            await erase.run(context, { round: 3 });
            expect(await marked()).toBe(6);
            expect(await erasedAt()).toBeNull();
            for (const id of [...rows.slice(100).map((row) => row.id), pendingId]) {
              // oxlint-disable-next-line no-await-in-loop -- The last batch includes the in-flight session, whose abort must commit before finalization.
              await cleanup.run(context, { fileId: id });
            }
            await Bun.sleep(2100);
            slow.finish('P');
            await slow.response;
            expect(await f.storage.head(stagingKey)).toBeNull();
            expect(await f.storage.head(storageKey)).toBeNull();
            expect(
              await f.storage
                .completeUpload({ ...sessionControl, size: 2 })
                .catch((error: unknown) => error),
            ).toMatchObject({ code: 'service_unavailable' });
            await f.db.execute(
              "alter table audit_logs add constraint fixture_project_final_audit check (action <> 'project.erased') not valid",
            );
            expect(
              await erase.run(context, { round: 4 }).catch((error: unknown) => error),
            ).toBeInstanceOf(Error);
            await f.db.execute(
              'alter table audit_logs drop constraint fixture_project_final_audit',
            );
            expect(await erasedAt()).toBeNull();
            await erase.run(context, { round: 4 });
            expect(await erasedAt()).not.toBeNull();
            expect(
              (
                await Promise.all(
                  rows.flatMap((row) => [
                    f.storage.head(row.storageKey),
                    f.storage.head(row.stagingKey),
                  ]),
                )
              ).every((head) => head === null),
            ).toBe(true);
            await assertProjectDataGone(f.db, f.a1.id);
            expect(await new Response(await f.storage.read(neighbourKey)).bytes()).toEqual(
              files[0]!.bytes,
            );
            expect(
              (
                await f.db.execute<{ deleted_at: unknown }>(
                  `select deleted_at from files where id = '${neighbour.fileId}'`,
                )
              ).rows[0]?.deleted_at,
            ).toBeNull();
          } finally {
            proxy.unavailable(false);
            slow?.close();
            await slow?.response;
            if (sessionControl) await f.storage.abortUpload(sessionControl);
            await f.cleanup();
          }
        },
        { ...attachmentsEnvironment, S3_ENDPOINT: proxy.endpoint },
        {
          durableDelivery: true,
          consumeJobs: false,
          keyClock: { now: () => new Date(Date.now() + shift) },
        },
      );
    } finally {
      await proxy.close();
    }
  },
  90_000,
);
