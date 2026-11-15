import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';

import {
  clamavAvailable,
  clamavTestConfig,
  EICAR_TEST_BYTES,
} from '../../../scripts/test/clamav.ts';
import { scenario } from '../test/auth-fixture.ts';
import {
  prepareUploads,
  uploadsAvailable,
  uploadsEnvironment,
  readUploadFixture as fixture,
} from '../test/uploads-fixture.ts';

const scannerAvailable = await clamavAvailable();
const scannedEnvironment = {
  ...uploadsEnvironment,
  SCANNER: 'clamav',
  CLAMAV_HOST: clamavTestConfig.host,
  CLAMAV_PORT: String(clamavTestConfig.port),
};

test.skipIf(!uploadsAvailable)(
  'COPY survives SQL rollback; consumed upload sessions cannot replace its bytes',
  async () => {
    await scenario(
      async (base) => {
        const f = await prepareUploads(base);
        try {
          const file = await f.intent();
          await f.put(file);
          expect((await f.complete(file)).status).toBe(200);
          const job = f.jobs().find((entry) => entry.name === 'uploads.scan');
          if (!job) throw new Error('Missing scan worker.');
          await f.db.execute(
            "alter table files add constraint fixture_scan_commit_failure check (status <> 'ready') not valid",
          );
          expect(
            await job.run(f.scope, { fileId: file.fileId }).catch((error: unknown) => error),
          ).toMatchObject({ cause: { code: '23514' } });
          const row = await f.use(async (tx) => tx.modules.uploads?.get(file.fileId, f.now()));
          if (!row) throw new Error('Missing file.');
          expect(row.status).toBe('uploaded');
          expect(row.copiedAt).toBeNull();
          expect(await f.storage.head(row.storageKey)).not.toBeNull();
          const replacement = new TextEncoder().encode('%PDF-1.7\nchanged\n%%EOF');
          expect(
            (
              await fetch(file.uploadUrl, {
                method: 'PUT',
                headers: file.headers,
                body: replacement,
              })
            ).status,
          ).toBe(404);
          await f.db.execute('alter table files drop constraint fixture_scan_commit_failure');
          await job.run(f.scope, { fileId: file.fileId });
          const ready = await f.use(async (tx) => tx.modules.uploads?.get(file.fileId, f.now()));
          expect(ready?.status).toBe('ready');
          expect(Buffer.from(ready!.sha256!).toString('hex')).toBe(
            createHash('sha256').update(file.bytes).digest('hex'),
          );
          expect(ready?.scan).toMatchObject({ status: 'not_scanned' });
          expect(await new Response(await f.storage.read(row.storageKey)).text()).toBe(
            new TextDecoder().decode(file.bytes),
          );
          expect(await f.storage.head(row.stagingKey)).toBeNull();
          await job.run(f.scope, { fileId: file.fileId });
          expect((await f.complete(file)).status).toBe(200);
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
  'scan inspection rejects executable PDF declarations and accepts supported real image/Office bytes',
  async () => {
    await scenario(
      async (base) => {
        const f = await prepareUploads(base, {
          presets: ['images', 'pdf', 'office'],
          limits: { perMinute: 100, perHour: 1000 },
        });
        try {
          const job = f.jobs().find((entry) => entry.name === 'uploads.scan');
          if (!job) throw new Error('Missing scan worker.');
          const executable = await f.intent(
            'fake.pdf',
            new TextEncoder().encode('MZ'.padEnd(100, '\0')),
          );
          await f.put(executable);
          await f.complete(executable);
          await job.run(f.scope, { fileId: executable.fileId });
          expect(
            (await f.use(async (tx) => tx.modules.uploads?.get(executable.fileId, f.now())))
              ?.status,
          ).toBe('rejected');
          const formats = [
            ['png', 'image/png'],
            ['jpg', 'image/jpeg'],
            ['webp', 'image/webp'],
            ['gif', 'image/gif'],
            ['docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
            ['xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
            ['pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
          ] as const;
          for (const [ext, mime] of formats) {
            // oxlint-disable-next-line no-await-in-loop -- Each format traverses real intent/PUT/completion/worker frames.
            const file = await f.intent(`valid.${ext}`, await fixture(`valid.${ext}`), mime);
            // oxlint-disable-next-line no-await-in-loop -- Storage's signed PUT must finish before its completion.
            await f.put(file);
            // oxlint-disable-next-line no-await-in-loop -- The worker reads the completed staging object.
            expect((await f.complete(file)).status).toBe(200);
            // oxlint-disable-next-line no-await-in-loop -- One worker invocation per independent file.
            await job.run(f.scope, { fileId: file.fileId });
            // oxlint-disable-next-line no-await-in-loop -- The scoped result is inspected after its commit.
            const result = await f.use(async (tx) => tx.modules.uploads?.get(file.fileId, f.now()));
            expect({ status: result?.status, mime: result?.detectedMime }).toEqual({
              status: 'ready',
              mime,
            });
          }
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

test.skipIf(!uploadsAvailable || !scannerAvailable)(
  'real ClamAV scans the immutable private copy; EICAR quarantines even when type detection is unknown',
  async () => {
    await scenario(
      async (base) => {
        const f = await prepareUploads(base, { scanRequired: true });
        try {
          const job = f.jobs().find((entry) => entry.name === 'uploads.scan');
          if (!job) throw new Error('Missing scan worker.');
          const clean = await f.intent();
          await f.put(clean);
          await f.complete(clean);
          await job.run(f.scope, { fileId: clean.fileId });
          expect(
            (await f.use(async (tx) => tx.modules.uploads?.get(clean.fileId, f.now())))?.scan,
          ).toMatchObject({ status: 'clean' });
          const virus = await f.intent('eicar.pdf', EICAR_TEST_BYTES);
          await f.put(virus);
          await f.complete(virus);
          await job.run(f.scope, { fileId: virus.fileId });
          expect(
            (await f.use(async (tx) => tx.modules.uploads?.get(virus.fileId, f.now())))?.status,
          ).toBe('quarantined');
          expect(f.logs.join('')).not.toContain('EICAR-STANDARD');
        } finally {
          await f.cleanup();
        }
      },
      scannedEnvironment,
      { durableDelivery: true, consumeJobs: false },
    );
  },
  30_000,
);
