import { expect, test } from 'bun:test';

import { PLATFORM_JOBS, queueEnvelopeSchema } from '@backbricks/core';

import { attachmentsEnvironment, prepareAttachments } from '../test/attachments-fixture.ts';
import { scenario } from '../test/auth-fixture.ts';
import { createStorageProxy } from '../test/storage-proxy.ts';
import { uploadsAvailable } from '../test/uploads-fixture.ts';

const body = { email: 'PERSON@example.test' };

test.skipIf(!uploadsAvailable)(
  'subject erasure sheds personal metadata immediately and completes only after real storage recovery, with email-free continuations',
  async () => {
    const proxy = createStorageProxy();
    let shift = 0;
    try {
      await scenario(
        async (base) => {
          const f = await prepareAttachments(base);
          try {
            const file = await f.ready('private-person.pdf');
            await f.submit([file.fileRef]);
            const neighbour = await f.ready('neighbour.pdf');
            await f.submit([neighbour.fileRef], f.form.key, 'neighbour@example.test');
            const neighbourRow = await f.use(async (tx) =>
              tx.modules.uploads?.get(neighbour.fileId, f.now()),
            );
            if (!neighbourRow) throw new Error('Missing neighbour');
            const row = await f.use(async (tx) => tx.modules.uploads?.get(file.fileId, f.now()));
            if (!row) throw new Error('Missing fixture file');
            const erase = f.jobs().find((job) => job.name === PLATFORM_JOBS.subjectErasure);
            const settle = f.jobs().find((job) => job.name === PLATFORM_JOBS.subjectErasureSettle);
            const cleanup = f.jobs().find((job) => job.name === 'uploads.cleanup-file');
            if (!erase || !settle || !cleanup) throw new Error('Missing privacy workers');
            await f.db.execute(
              "alter table audit_logs add constraint fixture_subject_pending check (action <> 'privacy.subject_erasure_pending') not valid",
            );
            expect(
              await erase.run(f.scope, { email: body.email }).catch((error: unknown) => error),
            ).toBeInstanceOf(Error);
            await f.db.execute('alter table audit_logs drop constraint fixture_subject_pending');
            await f.db.execute(
              "alter table pgboss.job add constraint fixture_subject_queue check (name <> 'core.privacy.settle') not valid",
            );
            expect(
              await erase.run(f.scope, { email: body.email }).catch((error: unknown) => error),
            ).toBeInstanceOf(Error);
            await f.db.execute('alter table pgboss.job drop constraint fixture_subject_queue');
            expect(
              (await f.use(async (tx) => tx.modules.uploads?.get(file.fileId, f.now())))
                ?.originalName,
            ).toBe('private-person.pdf');
            expect(await f.storage.head(row.storageKey)).not.toBeNull();
            proxy.unavailable(true);
            await erase.run(f.scope, { email: body.email });
            const marker = await f.use(async (tx) =>
              tx.modules.uploads?.get(file.fileId, f.now(), { includeInactive: true }),
            );
            expect(marker).toMatchObject({
              originalName: 'deleted',
              subjectEmail: null,
              ownerId: null,
              metadata: {},
              sha256: null,
              scan: null,
            });
            expect(
              (
                await f.db.execute<{ id: string }>(
                  "select id from form_submissions where subject_email = 'person@example.test'",
                )
              ).rows,
            ).toHaveLength(0);
            const jobs = (
              await f.db.execute<{ data: unknown }>(
                `select data from pgboss.job where name = '${PLATFORM_JOBS.subjectErasureSettle}'`,
              )
            ).rows;
            expect(jobs).toHaveLength(1);
            expect(JSON.stringify(jobs)).not.toContain('person@example.test');
            const payload = queueEnvelopeSchema.parse(jobs[0]?.data).payload;
            await cleanup.run(f.scope, { fileId: file.fileId });
            await settle.run(f.scope, payload);
            expect(
              (
                await f.db.execute<{ id: string }>(
                  "select id from audit_logs where action = 'privacy.module_subject_erased'",
                )
              ).rows,
            ).toHaveLength(0);
            expect(await f.storage.head(row.storageKey)).not.toBeNull();
            proxy.unavailable(false);
            shift = 301_000;
            await cleanup.run(f.scope, { fileId: file.fileId });
            expect(await f.storage.head(row.storageKey)).toBeNull();
            expect(await f.storage.head(row.stagingKey)).toBeNull();
            expect(await f.storage.head(neighbourRow.storageKey)).not.toBeNull();
            expect(
              (await f.use(async (tx) => tx.modules.uploads?.get(neighbour.fileId, f.now())))
                ?.subjectEmail,
            ).toBe('neighbour@example.test');
            await settle.run(f.scope, payload);
            expect(
              (
                await f.db.execute<{ id: string }>(
                  `select id from files where id = '${file.fileId}'`,
                )
              ).rows,
            ).toHaveLength(0);
            expect(
              (
                await f.db.execute<{ id: string }>(
                  "select id from audit_logs where action = 'privacy.module_subject_erased'",
                )
              ).rows,
            ).toHaveLength(1);
          } finally {
            proxy.unavailable(false);
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
  30_000,
);
