/* oxlint-disable no-await-in-loop -- Deletion modes exercise sequential transitions on the same form. */
import { expect, test } from 'bun:test';

import { PLATFORM_JOBS } from '@backbricks/core';

import {
  attachmentsCatalog,
  attachmentsEnvironment,
  prepareAttachments,
} from '../test/attachments-fixture.ts';
import { idResponseSchema, scenario } from '../test/auth-fixture.ts';
import { uploadsAvailable } from '../test/uploads-fixture.ts';

test.skipIf(!uploadsAvailable)(
  'owner retention and spam changes bound attachment expiry, and retention deletion schedules cleanup',
  async () => {
    await scenario(
      async (base) => {
        const f = await prepareAttachments(base);
        try {
          const file = await f.ready();
          const { id } = idResponseSchema.parse(await (await f.submit([file.fileRef])).json());
          const path = `/v1/projects/${f.a1.id}/forms/${f.form.key}`;
          const changed = await f.request(
            path,
            { configVersion: 1, config: { retentionDays: null } },
            f.owner.cookie,
            undefined,
            'PATCH',
          );
          expect(changed.status).toBe(200);

          expect(
            (
              await f.request(
                `${path}/submissions/${id}`,
                { spamVerdict: 'spam' },
                f.member.cookie,
                undefined,
                'PATCH',
              )
            ).status,
          ).toBe(200);
          const entry = await f.use(async (tx) => tx.modules.forms?.get(f.form.id, id));
          const upload = await f.use(async (tx) => tx.modules.uploads?.get(file.fileId, f.now()));
          expect(upload?.ownerExpiresAt).toEqual(entry?.expiresAt);
          await f.db.execute(
            `update form_submissions set created_at = current_timestamp - interval '2 seconds', expires_at = current_timestamp - interval '1 second' where id = '${id}'`,
          );
          const purge = f
            .jobs()
            .find((candidate) => candidate.name === PLATFORM_JOBS.retentionPurge);
          if (!purge) throw new Error('Missing retention handler');
          await purge.run(f.scope, {});
          const deleted = await f.use(async (tx) =>
            tx.modules.uploads?.get(file.fileId, f.now(), { includeInactive: true }),
          );
          expect(deleted?.deletedAt).toBeInstanceOf(Date);
          expect(deleted?.cleanupAfter).toBeInstanceOf(Date);
        } finally {
          await f.cleanup();
        }
      },
      attachmentsEnvironment,
      { catalog: attachmentsCatalog, durableDelivery: true, consumeJobs: false },
    );
  },
  30_000,
);

test.skipIf(!uploadsAvailable)(
  'single, bulk, delete-all and subject erasure mark every owned file in the owner transaction',
  async () => {
    await scenario(
      async (base) => {
        const f = await prepareAttachments(base);
        try {
          for (const mode of ['single', 'bulk', 'all', 'subject']) {
            const file = await f.ready();
            const { id } = idResponseSchema.parse(
              await (await f.submit([file.fileRef], f.form.key, `${mode}@example.test`)).json(),
            );
            const path = `/v1/projects/${f.a1.id}/forms/${f.form.key}/submissions`;
            if (mode === 'single') {
              await f.db.execute(
                "alter table audit_logs add constraint fixture_attachment_delete_failure check (action <> 'forms.submission.deleted') not valid",
              );
              expect(
                (await f.request(`${path}/${id}`, undefined, f.member.cookie, undefined, 'DELETE'))
                  .status,
              ).toBe(500);
              await f.db.execute(
                'alter table audit_logs drop constraint fixture_attachment_delete_failure',
              );
              expect(
                (await f.use(async (tx) => tx.modules.uploads?.get(file.fileId, f.now())))
                  ?.deletedAt,
              ).toBeNull();
              expect((await f.request(`${path}/${id}`, undefined, f.member.cookie)).status).toBe(
                200,
              );
            }
            if (mode === 'single')
              expect(
                (await f.request(`${path}/${id}`, undefined, f.member.cookie, undefined, 'DELETE'))
                  .status,
              ).toBe(204);
            if (mode === 'bulk')
              expect(
                (await f.request(`${path}/bulk-delete`, { ids: [id] }, f.admin.cookie)).status,
              ).toBe(200);
            if (mode === 'all') {
              expect(
                (await f.request(`${path}/delete-all`, { confirm: f.form.key }, f.admin.cookie))
                  .status,
              ).toBe(202);
              const job = f
                .jobs()
                .find((candidate) => candidate.name === 'forms.submissions.delete-all');
              if (!job) throw new Error('Missing delete-all handler');
              await job.run(f.scope, { instanceId: f.form.id });
            }
            if (mode === 'subject') {
              const job = f
                .jobs()
                .find((candidate) => candidate.name === PLATFORM_JOBS.subjectErasure);
              if (!job) throw new Error('Missing subject erasure handler');
              await job.run(f.scope, { email: `${mode}@example.test` });
            }
            const deleted = await f.use(async (tx) =>
              tx.modules.uploads?.get(file.fileId, f.now(), { includeInactive: true }),
            );
            expect(deleted?.deletedAt).toBeInstanceOf(Date);
            const cleanup = f.jobs().find((candidate) => candidate.name === 'uploads.cleanup-file');
            if (!cleanup || !deleted) throw new Error('Missing cleanup handler or file');
            await cleanup.run(f.scope, { fileId: file.fileId });
            expect(await f.storage.head(deleted.storageKey)).toBeNull();
            expect(await f.storage.head(deleted.stagingKey)).toBeNull();
          }
        } finally {
          await f.cleanup();
        }
      },
      attachmentsEnvironment,
      { durableDelivery: true, consumeJobs: false },
    );
  },
  60_000,
);

test.skipIf(!uploadsAvailable)(
  'project erasure retains attachment identity until cleanup and the last PUT expiry',
  async () => {
    let shift = 0;
    const clock = { now: () => new Date(Date.now() + shift) };
    await scenario(
      async (base) => {
        const f = await prepareAttachments(base);
        try {
          const file = await f.ready();
          await f.submit([file.fileRef]);
          const row = await f.use(async (tx) => tx.modules.uploads?.get(file.fileId, f.now()));
          if (!row) throw new Error('Missing file');
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
          const erase = f
            .jobs()
            .find((candidate) => candidate.name === PLATFORM_JOBS.projectErasure);
          const cleanup = f.jobs().find((candidate) => candidate.name === 'uploads.cleanup-file');
          if (!erase || !cleanup) throw new Error('Missing erasure handlers');
          const context = { ...f.scope, archivedProject: true as const };
          await erase.run(context, {});
          const retained = await f.db.execute<{ deleted_at: Date }>(
            `select deleted_at from files where id = '${file.fileId}'`,
          );
          expect(retained.rows[0]?.deleted_at).not.toBeNull();
          expect(
            (
              await f.db.execute<{ erased_at: Date | null }>(
                `select erased_at from projects where id = '${f.a1.id}'`,
              )
            ).rows[0]?.erased_at,
          ).toBeNull();
          await cleanup.run(context, { fileId: file.fileId });
          expect(await f.storage.head(row.storageKey)).toBeNull();
          // A finalized session cannot recreate an object even while its signature is live.
          expect(
            (
              await fetch(file.uploadUrl, {
                method: 'PUT',
                headers: file.headers,
                body: file.bytes,
              })
            ).status,
          ).toBe(404);
          expect(await f.storage.head(row.stagingKey)).toBeNull();
          await erase.run(context, { round: 2 });
          expect(
            (await f.db.execute<{ id: string }>(`select id from files where id = '${file.fileId}'`))
              .rows,
          ).toHaveLength(1);
          shift = 301_000;
          await cleanup.run(context, { fileId: file.fileId });
          expect(await f.storage.head(row.stagingKey)).toBeNull();
          await erase.run(context, { round: 3 });
          expect(
            (
              await f.db.execute<{ id: string }>(
                `select id from files where project_id = '${f.a1.id}'`,
              )
            ).rows,
          ).toEqual([]);
          expect(
            (
              await f.db.execute<{ erased_at: Date | null }>(
                `select erased_at from projects where id = '${f.a1.id}'`,
              )
            ).rows[0]?.erased_at,
          ).not.toBeNull();
        } finally {
          await f.cleanup();
        }
      },
      attachmentsEnvironment,
      { durableDelivery: true, consumeJobs: false, keyClock: clock },
    );
  },
  30_000,
);
