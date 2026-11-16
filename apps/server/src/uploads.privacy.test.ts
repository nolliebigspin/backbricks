import { expect, test } from 'bun:test';

import {
  defineModuleCatalog,
  type RegisteredModule,
  subjectExportResponseSchema,
  subjectAttachmentSchema,
} from '@backbricks/core';
import { createFormsModule } from '@backbricks/module-forms';
import { uploadsModule } from '@backbricks/module-uploads';
import { unzipSync } from 'fflate';
import { z } from 'zod';

import {
  clamavAvailable,
  clamavTestConfig,
  EICAR_TEST_BYTES,
} from '../../../scripts/test/clamav.ts';
import { attachmentsEnvironment, prepareAttachments } from '../test/attachments-fixture.ts';
import { scenario } from '../test/auth-fixture.ts';
import { createProjectUploadIntent } from '../test/isolation/uploads-cases.ts';
import { createStorageProxy } from '../test/storage-proxy.ts';
import { uploadsAvailable } from '../test/uploads-fixture.ts';

const manifestSchema = z.object({
  modules: z.record(z.string(), z.unknown()),
  files: z.array(
    z.object({
      module: z.string(),
      metadata: subjectAttachmentSchema,
      path: z.string().nullable(),
    }),
  ),
});
const manifestOf = (contents: ReturnType<typeof unzipSync>) =>
  manifestSchema.parse(JSON.parse(new TextDecoder().decode(contents['manifest.json'])));
const body = { email: 'PERSON@example.test' };

test.skipIf(!uploadsAvailable)(
  'subject JSON and ZIP contain complete scoped metadata and exact ready bytes, explaining a missing object',
  async () => {
    await scenario(
      async (base) => {
        const f = await prepareAttachments(base);
        try {
          const present = await f.ready('Résumé.pdf');
          const missing = await f.ready('missing.pdf');
          expect((await f.submit([present.fileRef, missing.fileRef])).status).toBe(200);
          const foreign = await createProjectUploadIntent(f, f.a2, f.owner);
          await f.db.execute(
            `update files set subject_email = 'person@example.test' where id = '${foreign.fileId}'`,
          );
          const row = await f.use(async (tx) => tx.modules.uploads?.get(missing.fileId, f.now()));
          if (!row) throw new Error('Missing fixture file');
          await f.storage.delete(row.storageKey);
          const root = `/v1/projects/${f.a1.id}/privacy`;
          const json = await f.request(`${root}/subject-export`, body, f.admin.cookie);
          expect(json.status).toBe(200);
          const exported = subjectExportResponseSchema.parse(await json.json());
          const metadata = JSON.stringify(exported);
          expect(metadata).toContain('Résumé.pdf');
          expect(metadata).not.toContain(present.uploadToken);
          expect(metadata).not.toContain(present.fileRef);
          expect(metadata).not.toContain('stagingKey');
          expect(metadata).not.toContain('uploadHandle');
          expect(metadata).not.toContain(foreign.fileId);
          const response = await f.request(`${root}/subject-export.zip`, body, f.admin.cookie);
          expect(response.status).toBe(200);
          expect(response.headers.get('content-disposition')).toContain('attachment;');
          const contents = unzipSync(await response.bytes());
          const manifest = manifestOf(contents);
          expect(manifest.files).toHaveLength(2);
          const available = manifest.files.find((file) => file.metadata.id === present.fileId);
          expect(available?.path).toBe(`files/uploads/${present.fileId}.bin`);
          expect(contents[available!.path!]).toEqual(present.bytes);
          expect(manifest.files.find((file) => file.metadata.id === missing.fileId)).toMatchObject({
            path: null,
            metadata: { availability: 'missing' },
          });
          expect(Object.keys(contents)).toHaveLength(2);
          const audit = await f.db.execute<{ changes: { reason?: string; count: number } }>(
            "select changes from audit_logs where action = 'privacy.subject_exported' order by created_at",
          );
          expect(audit.rows.map((entry) => entry.changes.reason)).toEqual([
            undefined,
            'started',
            'completed',
          ]);
          expect(audit.rows.at(-1)?.changes.count).toBe(1);
        } finally {
          await f.cleanup();
        }
      },
      attachmentsEnvironment,
      { durableDelivery: true, consumeJobs: false },
    );
  },
  30_000,
);

test.skipIf(!uploadsAvailable)(
  'ZIP export audits before bytes, handles cancellation and concurrent deletion, and has no end marker on completion rollback',
  async () => {
    let hold = false;
    const { promise: entered, resolve: enter } = Promise.withResolvers<void>();
    const { promise: released, resolve: unlock } = Promise.withResolvers<void>();
    const hooks = uploadsModule.privacy.attachments;
    if (!hooks) throw new Error('Missing attachment hooks');
    const gated: RegisteredModule = {
      ...uploadsModule,
      privacy: {
        ...uploadsModule.privacy,
        attachments: {
          ...hooks,
          async open(execution, email, id) {
            if (hold) {
              enter();
              await released;
            }
            return hooks.open(execution, email, id);
          },
        },
      },
    };
    const catalog = defineModuleCatalog([gated, createFormsModule({ files: true })]);
    await scenario(
      async (base) => {
        const f = await prepareAttachments(base);
        try {
          const file = await f.ready();
          await f.submit([file.fileRef]);
          const path = `/v1/projects/${f.a1.id}/privacy/subject-export.zip`;
          await f.db.execute(
            "alter table audit_logs add constraint fixture_zip_start check (action <> 'privacy.subject_exported') not valid",
          );
          expect((await f.request(path, body, f.admin.cookie)).status).toBe(500);
          await f.db.execute('alter table audit_logs drop constraint fixture_zip_start');
          const canceled = await f.request(path, body, f.admin.cookie);
          const reader = canceled.body!.getReader();
          expect((await reader.read()).done).toBe(false);
          await reader.cancel();
          expect(
            (
              await f.db.execute<{ n: number }>(
                "select count(*)::int as n from pg_stat_activity where datname = current_database() and state = 'idle in transaction'",
              )
            ).rows[0]?.n,
          ).toBe(0);
          await f.db.execute(
            "alter table audit_logs add constraint fixture_zip_finish check (not(action = 'privacy.subject_exported' and changes->>'reason' = 'completed')) not valid",
          );
          const failed = await f.request(path, body, f.admin.cookie);
          expect(await failed.bytes().catch((error: unknown) => error)).toBeInstanceOf(Error);
          await f.db.execute('alter table audit_logs drop constraint fixture_zip_finish');
          hold = true;
          const exporting = f.request(path, body, f.admin.cookie);
          await entered;
          expect(
            (
              await f.request(
                `/v1/projects/${f.a1.id}/files/${file.fileId}`,
                undefined,
                f.owner.cookie,
                undefined,
                'DELETE',
              )
            ).status,
          ).toBe(204);
          unlock();
          const concurrent = await exporting;
          const contents = unzipSync(await concurrent.bytes());
          expect(Object.keys(contents)).toEqual(['manifest.json']);
          expect(manifestOf(contents).files[0]).toMatchObject({
            path: null,
            metadata: { availability: 'deleted' },
          });
          const completed = (
            await f.db.execute<{ changes: unknown }>(
              "select changes from audit_logs where action = 'privacy.subject_exported' and changes->>'reason' = 'completed' order by created_at desc",
            )
          ).rows;
          expect(completed.length).toBeGreaterThanOrEqual(1);
          expect(completed[0]?.changes).toEqual({ count: 0, reason: 'completed' });
        } finally {
          await f.cleanup();
        }
      },
      attachmentsEnvironment,
      { durableDelivery: true, consumeJobs: false, catalog },
    );
  },
  30_000,
);

test.skipIf(!uploadsAvailable)(
  'ZIP availability is rechecked after provider I/O crosses the file expiry',
  async () => {
    const proxy = createStorageProxy();
    let shift = 0;
    try {
      await scenario(
        async (base) => {
          const f = await prepareAttachments(base);
          try {
            const file = await f.ready();
            await f.submit([file.fileRef]);
            await f.use(async (tx) =>
              tx.modules.uploads?.patch(file.fileId, {
                expiresAt: new Date(f.now().getTime() + 1000),
                updatedAt: f.now(),
              }),
            );
            proxy.onHead(() => {
              shift = 2000;
            });
            const response = await f.request(
              `/v1/projects/${f.a1.id}/privacy/subject-export.zip`,
              body,
              f.admin.cookie,
            );
            const contents = unzipSync(await response.bytes());
            expect(shift).toBe(2000);
            expect(Object.keys(contents)).toEqual(['manifest.json']);
            expect(manifestOf(contents).files[0]).toMatchObject({
              path: null,
              metadata: { availability: 'expired' },
            });
          } finally {
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

const scannerAvailable = await clamavAvailable();
test.skipIf(!uploadsAvailable || !scannerAvailable)(
  'a real quarantined EICAR is explained in the subject manifest and its bytes never enter the ZIP',
  async () => {
    await scenario(
      async (base) => {
        const f = await prepareAttachments(base);
        try {
          const file = await f.intent('eicar.pdf', EICAR_TEST_BYTES);
          await f.put(file);
          expect((await f.complete(file)).status).toBe(200);
          const scan = f.jobs().find((job) => job.name === 'uploads.scan');
          if (!scan) throw new Error('Missing scanner');
          await scan.run(f.scope, { fileId: file.fileId });
          const row = await f.use(async (tx) => tx.modules.uploads?.get(file.fileId, f.now()));
          expect(row?.status).toBe('quarantined');
          if (!row) throw new Error('Missing file');
          expect(await f.storage.head(row.storageKey)).not.toBeNull();
          // Trusted association fixture: public claims deliberately reject quarantined files.
          await f.db.execute(
            `update files set subject_email = 'person@example.test' where id = '${file.fileId}'`,
          );
          const response = await f.request(
            `/v1/projects/${f.a1.id}/privacy/subject-export.zip`,
            body,
            f.admin.cookie,
          );
          const contents = unzipSync(await response.bytes());
          expect(Object.keys(contents)).toEqual(['manifest.json']);
          expect(manifestOf(contents).files[0]).toMatchObject({
            path: null,
            metadata: { status: 'quarantined', scanStatus: 'infected', availability: 'not_ready' },
          });
          expect(new TextDecoder().decode(contents['manifest.json'])).not.toContain(
            'EICAR-STANDARD',
          );
        } finally {
          await f.cleanup();
        }
      },
      {
        ...attachmentsEnvironment,
        SCANNER: 'clamav',
        CLAMAV_HOST: clamavTestConfig.host,
        CLAMAV_PORT: String(clamavTestConfig.port),
      },
      { durableDelivery: true, consumeJobs: false },
    );
  },
  30_000,
);
