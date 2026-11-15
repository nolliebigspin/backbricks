import { expect, test } from 'bun:test';
import { createServer, type Socket } from 'node:net';

import { instanceResponseSchema } from '@backbricks/core';
import { uploadCompleteResponseSchema } from '@backbricks/module-uploads';

import {
  clamavAvailable,
  clamavTestConfig,
  EICAR_TEST_BYTES,
} from '../../../scripts/test/clamav.ts';
import { eventually } from '../../../scripts/test/eventually.ts';
import { receivedMail, receivedMailCount } from '../../../scripts/test/mailpit.ts';
import { scenario } from '../test/auth-fixture.ts';
import { prepareUploads, uploadsAvailable, uploadsEnvironment } from '../test/uploads-fixture.ts';

const scannerAvailable = await clamavAvailable();
const scannedEnvironment = {
  ...uploadsEnvironment,
  SCANNER: 'clamav',
  CLAMAV_HOST: clamavTestConfig.host,
  CLAMAV_PORT: String(clamavTestConfig.port),
};

test.skipIf(!uploadsAvailable || !scannerAvailable)(
  'EICAR commits one quarantine event, removes both objects and sends content-free Mailpit notification',
  async () => {
    await scenario(
      async (base) => {
        const f = await prepareUploads(base, { scanRequired: true });
        try {
          const zone = instanceResponseSchema.parse(
            await (await f.request(`${f.zonePath}/cv`, undefined, f.owner.cookie)).json(),
          );
          expect(
            (
              await f.request(
                `/v1/projects/${f.a1.id}/notification-rules`,
                {
                  eventType: 'uploads.file.quarantined',
                  instanceId: zone.id,
                  recipientUserIds: [f.member.id],
                },
                f.admin.cookie,
              )
            ).status,
          ).toBe(201);
          const file = await f.intent('private-person.pdf', EICAR_TEST_BYTES);
          await f.put(file);
          expect((await f.complete(file)).status).toBe(200);
          await eventually(
            async () =>
              (await f.use(async (tx) => tx.modules.uploads?.get(file.fileId, f.now())))?.status ===
              'quarantined',
            15_000,
          );
          const completion = uploadCompleteResponseSchema.parse(
            await (await f.complete(file)).json(),
          );
          expect({ ...completion, fileId: '[fileId]', fileRef: '[fileRef]' }).toMatchSnapshot();
          const row = await f.use(async (tx) => tx.modules.uploads?.get(file.fileId, f.now()));
          if (!row) throw new Error('Missing quarantine record.');
          await eventually(
            async () =>
              (await f.storage.head(row.storageKey)) === null &&
              (await f.storage.head(row.stagingKey)) === null,
            15_000,
          );
          await f.dispatchOutbox();
          await eventually(
            async () => (await receivedMailCount(f.member.email, 'New')) === 1,
            15_000,
          );
          const mail = await receivedMail(f.member.email, 0, 'New');
          expect(mail.Text).toContain(file.fileId);
          for (const value of ['private-person', 'EICAR', file.uploadToken, file.uploadUrl])
            expect(`${mail.Text}${mail.HTML}`).not.toContain(value);
          const scan = f.jobs().find((job) => job.name === 'uploads.scan');
          if (!scan) throw new Error('Missing scan handler.');
          await scan.run(f.scope, { fileId: file.fileId });
          const events = await f.db.execute<{ payload: unknown }>(
            "select payload from events where type='uploads.file.quarantined'",
          );
          expect(events.rows).toHaveLength(1);
          const records = await f.db.execute<{ value: string }>(
            "select concat_ws(' ', (select string_agg(data::text, ' ') from pgboss.job), (select string_agg(payload::text, ' ') from events), (select string_agg(changes::text, ' ') from audit_logs)) as value",
          );
          expect(records.rows[0]?.value).not.toContain(file.uploadToken);
          expect(records.rows[0]?.value).not.toContain('private-person');
          expect(f.logs.join('')).not.toContain(file.uploadToken);
        } finally {
          await f.cleanup();
        }
      },
      scannedEnvironment,
      { durableDelivery: true },
    );
  },
  45_000,
);

test.skipIf(!uploadsAvailable)(
  'provider failures persist three attempts, ignore duplicate deliveries and durably clean terminal rejection',
  async () => {
    await scenario(
      async (base) => {
        const f = await prepareUploads(base, { scanRequired: true });
        try {
          const file = await f.intent();
          await f.put(file);
          await f.complete(file);
          const scan = f.jobs().find((job) => job.name === 'uploads.scan');
          const cleanup = f.jobs().find((job) => job.name === 'uploads.cleanup-file');
          if (!scan || !cleanup) throw new Error('Missing upload handlers.');
          await scan.run(f.scope, { fileId: file.fileId });
          expect(
            await f.use(async (tx) => tx.modules.uploads?.get(file.fileId, f.now())),
          ).toMatchObject({ status: 'scanning', scan: { status: 'retrying' } });
          await scan.run(f.scope, { fileId: file.fileId });
          expect(
            (await f.use(async (tx) => tx.modules.uploads?.get(file.fileId, f.now())))
              ?.scanAttempts,
          ).toBe(1);
          await scan.run(f.scope, { fileId: file.fileId, attempt: 1 });
          await scan.run(f.scope, { fileId: file.fileId, attempt: 2 });
          const row = await f.use(async (tx) => tx.modules.uploads?.get(file.fileId, f.now()));
          if (!row) throw new Error('Missing rejected file.');
          expect(row.status).toBe('rejected');
          expect(row.scanAttempts).toBe(3);
          expect(row.scan).toMatchObject({ status: 'failed', reason: 'provider_unavailable' });
          expect(
            (
              await f.db.execute<{ id: string }>(
                "select id from events where type='uploads.file.rejected'",
              )
            ).rows,
          ).toHaveLength(1);
          await cleanup.run(f.scope, { fileId: file.fileId });
          expect(await f.storage.head(row.storageKey)).toBeNull();
          expect(await f.storage.head(row.stagingKey)).toBeNull();
          const retained = await f.use(async (tx) => tx.modules.uploads?.get(file.fileId, f.now()));
          expect(retained?.storageCleanedAt).not.toBeNull();
          expect(retained?.cleanupAfter).toEqual(row.uploadExpiresAt);
          expect(retained?.deletedAt).toBeNull();
        } finally {
          await f.cleanup();
        }
      },
      { ...uploadsEnvironment, SCANNER: 'clamav', CLAMAV_HOST: '127.0.0.1', CLAMAV_PORT: '1' },
      { durableDelivery: true, consumeJobs: false },
    );
  },
  30_000,
);

test.skipIf(!uploadsAvailable)(
  'event and audit failures roll back terminal state, attempts and cleanup jobs without replacing the final copy',
  async () => {
    await scenario(
      async (base) => {
        const f = await prepareUploads(base);
        try {
          const scan = f.jobs().find((job) => job.name === 'uploads.scan');
          if (!scan) throw new Error('Missing scan handler.');
          for (const table of ['events', 'audit_logs']) {
            // oxlint-disable-next-line no-await-in-loop -- Each failure uses a new real file and database constraint.
            const file = await f.intent();
            // oxlint-disable-next-line no-await-in-loop -- Signed bytes precede completion.
            await f.put(file);
            // oxlint-disable-next-line no-await-in-loop -- Completion enlists the initial scan job.
            await f.complete(file);
            // oxlint-disable-next-line no-await-in-loop -- Table/column names are test-owned constants, never user input.
            await f.db.execute(
              `alter table ${table} add constraint fixture_upload_outcome_failure check (${table === 'events' ? 'type' : 'action'} <> 'uploads.file.ready') not valid`,
            );
            expect(
              // oxlint-disable-next-line no-await-in-loop -- The forced terminal write must fail the entire worker transaction.
              await scan.run(f.scope, { fileId: file.fileId }).catch((error: unknown) => error),
            ).toMatchObject({ cause: { code: '23514' } });
            // oxlint-disable-next-line no-await-in-loop -- Read committed state after the rollback.
            const row = await f.use(async (tx) => tx.modules.uploads?.get(file.fileId, f.now()));
            expect(row).toMatchObject({ status: 'uploaded', scanAttempts: 0, cleanupAfter: null });
            // oxlint-disable-next-line no-await-in-loop -- Remove only this iteration's failure fixture.
            await f.db.execute(
              `alter table ${table} drop constraint fixture_upload_outcome_failure`,
            );
            // oxlint-disable-next-line no-await-in-loop -- Retrying reuses the immutable copy left by the rolled-back frame.
            await scan.run(f.scope, { fileId: file.fileId });
          }
          expect(
            (
              await f.db.execute<{ id: string }>(
                "select id from events where type='uploads.file.ready'",
              )
            ).rows,
          ).toHaveLength(2);
          expect(
            (
              await f.db.execute<{ id: string }>(
                "select id from pgboss.job where name='uploads.cleanup-file'",
              )
            ).rows,
          ).toHaveLength(2);
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
  'zone policy changes wait for the scan transaction before changing accepted-file semantics',
  async () => {
    let notify: (() => void) | undefined;
    const inspecting = new Promise<void>((resolve) => {
      notify = resolve;
    });
    let pending: Socket | undefined;
    const server = createServer((socket) => {
      let input = Buffer.alloc(0);
      socket.on('data', (data: Buffer) => {
        input = Buffer.concat([input, data]);
        if (input.byteLength >= 40 && input.subarray(-4).equals(new Uint8Array(4))) {
          pending = socket;
          notify?.();
        }
      });
      socket.on('error', () => {});
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing scanner listener.');
    try {
      await scenario(
        async (base) => {
          const f = await prepareUploads(base, { scanRequired: true });
          let worker: Promise<void> | undefined;
          try {
            const file = await f.intent();
            await f.put(file);
            await f.complete(file);
            const scan = f.jobs().find((job) => job.name === 'uploads.scan');
            if (!scan) throw new Error('Missing scan handler.');
            worker = scan.run(f.scope, { fileId: file.fileId });
            await inspecting;
            const zone = instanceResponseSchema.parse(
              await (await f.request(`${f.zonePath}/cv`, undefined, f.owner.cookie)).json(),
            );
            let updateStatus = 'pending';
            const update = f
              .request(
                `${f.zonePath}/cv`,
                { configVersion: zone.configVersion, config: { limits: { perMinute: 100 } } },
                f.owner.cookie,
                undefined,
                'PATCH',
              )
              .then(
                (response) => {
                  updateStatus = String(response.status);
                  return { response };
                },
                (error: unknown) => ({ error }),
              );
            await eventually(async () => {
              if (updateStatus !== 'pending')
                throw new Error(`Policy update finished before scan release: ${updateStatus}`);
              const state = await f.db.execute<{ waiting: boolean }>(
                "select exists (select 1 from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and (query like '%projects%' or query like '%module_instances%')) as waiting",
              );
              return state.rows[0]?.waiting === true;
            });
            pending?.end('stream: OK\0');
            await worker;
            const updated = await update;
            if (!('response' in updated)) throw updated.error;
            expect(updated.response.status).toBe(200);
            expect(
              (await f.use(async (tx) => tx.modules.uploads?.get(file.fileId, f.now())))?.status,
            ).toBe('ready');
          } finally {
            pending?.end('stream: OK\0');
            await worker?.catch(() => {});
            await f.cleanup();
          }
        },
        {
          ...uploadsEnvironment,
          SCANNER: 'clamav',
          CLAMAV_HOST: '127.0.0.1',
          CLAMAV_PORT: String(address.port),
        },
        { durableDelivery: true, consumeJobs: false },
      );
    } finally {
      pending?.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
  30_000,
);
