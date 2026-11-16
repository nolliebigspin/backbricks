import { expect, test } from 'bun:test';

import { downloadUrlSchema } from '@backbricks/module-uploads';

import { scenario } from '../test/auth-fixture.ts';
import { issueKey } from '../test/platform-read-fixture.ts';
import { createStorageProxy } from '../test/storage-proxy.ts';
import {
  prepareUploads,
  uploadsAvailable,
  uploadsEnvironment,
  readUploadFixture,
} from '../test/uploads-fixture.ts';

test.skipIf(!uploadsAvailable)(
  'audited downloads force attachments, restrict previews to detected images and never exceed the file lifetime',
  async () => {
    await scenario(
      async (base) => {
        const f = await prepareUploads(base, { presets: ['pdf', 'images'] });
        try {
          const file = await f.ready('résumé (final).pdf');
          const pending = await f.intent();
          const root = `/v1/projects/${f.a1.id}/files`;
          const request = (id = file.fileId, preview = false) =>
            f.request(`${root}/${id}/download-url`, { preview }, f.member.cookie);
          expect(
            (await f.request(`${root}/${file.fileId}/download-url`, {}, undefined, f.headers))
              .status,
          ).toBe(403);
          const first = await request();
          expect(first.status).toBe(200);
          expect(first.headers.get('cache-control')).toBe('no-store');
          const signed = downloadUrlSchema.parse(await first.json());
          expect(new URL(signed.url).searchParams.get('X-Amz-Expires')).toBe('60');
          const bytes = await fetch(signed.url);
          expect(bytes.status).toBe(200);
          expect(bytes.headers.get('content-type')).toBe('application/octet-stream');
          expect(bytes.headers.get('cache-control')).toBe('private, no-store');
          expect(bytes.headers.get('content-disposition')).toStartWith('attachment;');
          expect(bytes.headers.get('content-disposition')).toContain(
            "filename*=UTF-8''r%C3%A9sum%C3%A9%20%28final%29.pdf",
          );
          expect(new Uint8Array(await bytes.arrayBuffer())).toEqual(file.bytes);
          expect((await request(file.fileId, true)).status).toBe(422);
          expect((await request(pending.fileId)).status).toBe(404);
          const image = await f.ready(
            'image.png',
            await readUploadFixture('valid.png'),
            'image/png',
          );
          const preview = downloadUrlSchema.parse(await (await request(image.fileId, true)).json());
          const viewed = await fetch(preview.url);
          expect(viewed.headers.get('content-type')).toBe('image/png');
          expect(viewed.headers.get('content-disposition')).toStartWith('inline;');
          await viewed.body?.cancel();
          const key = await issueKey(f, f.a1.id, {
            kind: 'secret',
            name: 'Downloads',
            scopes: ['data:read'],
            expiresAt: null,
          });
          expect(
            (
              await f.request(`${root}/${file.fileId}/download-url`, {}, undefined, {
                authorization: `Bearer ${key.token}`,
              })
            ).status,
          ).toBe(200);
          await f.db.execute(
            "alter table audit_logs add constraint fixture_download_failure check (action <> 'files.downloaded') not valid",
          );
          const failed = await request();
          expect(failed.status).toBe(500);
          expect(await failed.text()).not.toContain('X-Amz-Signature');
          await f.db.execute('alter table audit_logs drop constraint fixture_download_failure');
          const expiry = new Date(f.now().getTime() + 3500);
          await f.use(async (tx) => {
            await tx.modules.uploads?.patch(file.fileId, { expiresAt: expiry, updatedAt: f.now() });
          });
          const clamped = downloadUrlSchema.parse(await (await request()).json());
          expect(
            Number(new URL(clamped.url).searchParams.get('X-Amz-Expires')),
          ).toBeLessThanOrEqual(3);
          expect(new Date(clamped.expiresAt).getTime()).toBeLessThanOrEqual(expiry.getTime());
          const audit = JSON.stringify(
            (
              await f.db.execute<{ changes: unknown }>(
                "select changes from audit_logs where action = 'files.downloaded'",
              )
            ).rows,
          );
          expect(audit).not.toContain('résumé');
          expect(f.logs.join('')).not.toContain('X-Amz-Signature');
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
  'download URL creation is rate limited and every issued URL has an audit entry',
  async () => {
    await scenario(
      async (base) => {
        const f = await prepareUploads(base);
        try {
          const file = await f.ready();
          const responses = await Promise.all(
            Array.from({ length: 31 }, () =>
              f.request(
                `/v1/projects/${f.a1.id}/files/${file.fileId}/download-url`,
                {},
                f.member.cookie,
              ),
            ),
          );
          expect(responses.filter((response) => response.status === 200)).toHaveLength(30);
          expect(responses.filter((response) => response.status === 429)).toHaveLength(1);
          const audited = await f.db.execute<{ count: string }>(
            "select count(*)::text as count from audit_logs where action = 'files.downloaded'",
          );
          expect(audited.rows[0]?.count).toBe('30');
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
  'slow storage authorization cannot issue a URL beyond the file deadline',
  async () => {
    const proxy = createStorageProxy();
    try {
      await scenario(
        async (base) => {
          const f = await prepareUploads(base);
          try {
            const file = await f.ready();
            await f.use(async (tx) => {
              await tx.modules.uploads?.patch(file.fileId, {
                expiresAt: new Date(f.now().getTime() + 2500),
                updatedAt: f.now(),
              });
            });
            proxy.delayHeads(2000);
            expect(
              (
                await f.request(
                  `/v1/projects/${f.a1.id}/files/${file.fileId}/download-url`,
                  {},
                  f.member.cookie,
                )
              ).status,
            ).toBe(404);
          } finally {
            proxy.delayHeads(0);
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
