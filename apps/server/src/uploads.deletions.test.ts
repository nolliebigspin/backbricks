import { expect, test } from 'bun:test';

import { scenario } from '../test/auth-fixture.ts';
import { issueKey } from '../test/platform-read-fixture.ts';
import { createStorageProxy } from '../test/storage-proxy.ts';
import { prepareUploads, uploadsAvailable, uploadsEnvironment } from '../test/uploads-fixture.ts';

test.skipIf(!uploadsAvailable)(
  'single and bulk revocation commit audit and cleanup atomically before touching private objects',
  async () => {
    await scenario(
      async (base) => {
        const f = await prepareUploads(base);
        try {
          const file = await f.ready();
          const second = await f.ready('second.pdf');
          const root = `/v1/projects/${f.a1.id}/files`;
          const row = await f.use(async (tx) => tx.modules.uploads?.get(file.fileId, f.now()));
          if (!row) throw new Error('Missing file');
          await f.db.execute(
            "alter table audit_logs add constraint fixture_file_delete_failure check (action <> 'uploads.file.deleted') not valid",
          );
          expect(
            (
              await f.request(
                `${root}/${file.fileId}`,
                undefined,
                f.member.cookie,
                undefined,
                'DELETE',
              )
            ).status,
          ).toBe(500);
          await f.db.execute('alter table audit_logs drop constraint fixture_file_delete_failure');
          expect(
            (await f.use(async (tx) => tx.modules.uploads?.get(file.fileId, f.now())))?.deletedAt,
          ).toBeNull();
          expect(await f.storage.head(row.storageKey)).not.toBeNull();
          expect(
            (
              await f.request(
                `${root}/bulk-delete`,
                { ids: [file.fileId, second.fileId] },
                f.member.cookie,
              )
            ).status,
          ).toBe(403);
          expect(
            (
              await f.request(
                `${root}/bulk-delete`,
                { ids: [file.fileId, file.fileId] },
                f.admin.cookie,
              )
            ).status,
          ).toBe(422);
          await f.db.execute(
            "alter table pgboss.job add constraint fixture_cleanup_enqueue_failure check (name <> 'uploads.cleanup-file') not valid",
          );
          expect(
            (
              await f.request(
                `${root}/${file.fileId}`,
                undefined,
                f.member.cookie,
                undefined,
                'DELETE',
              )
            ).status,
          ).toBe(500);
          await f.db.execute(
            'alter table pgboss.job drop constraint fixture_cleanup_enqueue_failure',
          );
          expect(
            (await f.use(async (tx) => tx.modules.uploads?.get(file.fileId, f.now())))?.deletedAt,
          ).toBeNull();
          expect(
            (
              await f.db.execute<{ count: string }>(
                "select count(*)::text as count from audit_logs where action = 'uploads.file.deleted'",
              )
            ).rows[0]?.count,
          ).toBe('0');
          const key = await issueKey(f, f.a1.id, {
            kind: 'secret',
            name: 'Delete',
            scopes: ['data:delete'],
            expiresAt: null,
          });
          expect(
            (
              await f.request(
                `${root}/${file.fileId}`,
                undefined,
                undefined,
                { authorization: `Bearer ${key.token}` },
                'DELETE',
              )
            ).status,
          ).toBe(204);
          expect(
            (await f.request(`${root}/${file.fileId}/download-url`, {}, f.member.cookie)).status,
          ).toBe(404);
          expect(await f.storage.head(row.storageKey)).not.toBeNull();
          const cleanup = f.jobs().find((job) => job.name === 'uploads.cleanup-file');
          if (!cleanup) throw new Error('Missing cleanup handler');
          await cleanup.run(f.scope, { fileId: file.fileId });
          expect(await f.storage.head(row.storageKey)).toBeNull();
          expect(
            (
              await f.request(`${root}/bulk-delete`, { ids: [second.fileId] }, undefined, {
                authorization: `Bearer ${key.token}`,
              })
            ).status,
          ).toBe(200);
        } finally {
          await f.cleanup();
        }
      },
      uploadsEnvironment,
      { durableDelivery: true, consumeJobs: false },
    );
  },
  30_000,
);

test.skipIf(!uploadsAvailable)(
  'cleanup retains durable state through a real storage outage and succeeds after recovery',
  async () => {
    const proxy = createStorageProxy();
    try {
      await scenario(
        async (base) => {
          const f = await prepareUploads(base);
          try {
            const file = await f.ready();
            const row = await f.use(async (tx) => tx.modules.uploads?.get(file.fileId, f.now()));
            if (!row) throw new Error('Missing file');
            expect(
              (
                await f.request(
                  `/v1/projects/${f.a1.id}/files/${file.fileId}`,
                  undefined,
                  f.member.cookie,
                  undefined,
                  'DELETE',
                )
              ).status,
            ).toBe(204);
            const cleanup = f.jobs().find((job) => job.name === 'uploads.cleanup-file');
            if (!cleanup) throw new Error('Missing cleanup handler');
            proxy.unavailable(true);
            await cleanup.run(f.scope, { fileId: file.fileId });
            const failed = await f.use(async (tx) =>
              tx.modules.uploads?.get(file.fileId, f.now(), { includeInactive: true }),
            );
            expect(failed?.cleanupAttempts).toBe(1);
            expect(failed?.storageCleanedAt).toBeNull();
            expect(failed?.cleanupAfter?.getTime()).toBeGreaterThan(f.now().getTime());
            expect(await f.storage.head(row.storageKey)).not.toBeNull();
            proxy.unavailable(false);
            await cleanup.run(f.scope, { fileId: file.fileId });
            expect(await f.storage.head(row.storageKey)).toBeNull();
          } finally {
            proxy.unavailable(false);
            await f.cleanup();
          }
        },
        { ...uploadsEnvironment, S3_ENDPOINT: proxy.endpoint },
        { durableDelivery: true, consumeJobs: false },
      );
    } finally {
      await proxy.close();
    }
  },
  30_000,
);
