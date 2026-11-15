import { expect, test } from 'bun:test';

import { altchaChallengeSchema } from '@backbricks/adapters';
import { monthlyUsagePeriod, instanceResponseSchema } from '@backbricks/core';
import { uploadIntentResponseSchema } from '@backbricks/module-uploads';
import { solveChallenge } from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/sha';

import { scenario } from '../test/auth-fixture.ts';
import { issueKey } from '../test/platform-read-fixture.ts';
import { assertAllowedFields, assertPublicResponseCoverage } from '../test/public-responses.ts';
import { prepareUploads, uploadsAvailable, uploadsEnvironment } from '../test/uploads-fixture.ts';

test.skipIf(!uploadsAvailable)(
  'upload intents and repeatable completion bind exact private bytes, scope and one durable scan job',
  async () => {
    await scenario(
      async (base) => {
        const f = await prepareUploads(base);
        try {
          const file = await f.intent();
          expect(new URL(file.uploadUrl).searchParams.get('X-Amz-Expires')).toBe('300');
          expect(file.headers).toMatchObject({
            'content-type': 'application/pdf',
            'content-length': String(file.bytes.byteLength),
          });
          const { bytes: _bytes, ...publicIntent } = file;
          assertAllowedFields(publicIntent, [
            'fileId',
            'uploadUrl',
            'headers.content-type',
            'headers.content-length',
            'uploadToken',
            'expiresAt',
          ]);
          expect({
            ...publicIntent,
            fileId: '[fileId]',
            uploadUrl: '[signed URL]',
            uploadToken: '[token]',
            expiresAt: '[expiry]',
            headers: file.headers,
          }).toMatchSnapshot();
          const publicRoutes = f
            .manifest()
            .filter(
              (route) =>
                route.path.startsWith('/v1/public/upload-zones') ||
                route.path.startsWith('/v1/public/files'),
            );
          assertPublicResponseCoverage(publicRoutes, {
            'POST /v1/public/upload-zones/{key}/files': {
              kind: 'fields',
              request: { path: '/v1/public/upload-zones/cv/files' },
              fields: [
                'fileId',
                'uploadUrl',
                'headers.content-type',
                'headers.content-length',
                'uploadToken',
                'expiresAt',
              ],
            },
            'POST /v1/public/files/{fileId}/complete': {
              kind: 'fields',
              request: { path: `/v1/public/files/${file.fileId}/complete` },
              fields: ['fileId', 'fileRef', 'status'],
            },
            'OPTIONS /v1/public/upload-zones/{key}/files': {
              kind: 'empty',
              request: { path: '/v1/public/upload-zones/cv/files' },
              status: 204,
            },
            'OPTIONS /v1/public/files/{fileId}/complete': {
              kind: 'empty',
              request: { path: `/v1/public/files/${file.fileId}/complete` },
              status: 204,
            },
          });
          for (const path of [
            '/v1/public/upload-zones/cv/files',
            `/v1/public/files/${file.fileId}/complete`,
          ]) {
            // oxlint-disable-next-line no-await-in-loop -- Each declared public namespace must serve its own real preflight.
            const preflight = await f.request(
              `${path}?key=${f.publishable.token}`,
              undefined,
              undefined,
              {
                origin: f.origin,
                'access-control-request-method': 'POST',
                'access-control-request-headers': 'content-type',
              },
              'OPTIONS',
            );
            expect(preflight.status).toBe(204);
          }
          const row = await f.use(async (tx) => tx.modules.uploads?.get(file.fileId, f.now()));
          expect(row?.uploadTokenHash).toHaveLength(32);
          expect(JSON.stringify(row)).not.toContain(file.uploadToken);
          expect(row?.expiresAt?.getTime()).toBe(row!.createdAt.getTime() + 86400000);
          expect((await f.complete(file)).status).toBe(422);
          expect(
            (
              await f.complete({
                ...file,
                uploadToken: file.uploadToken.replace(
                  /.$/,
                  file.uploadToken.endsWith('0') ? '1' : '0',
                ),
              })
            ).status,
          ).toBe(404);
          const wrong = await f.storage.presignPut({
            key: row!.stagingKey,
            contentType: 'application/pdf',
            size: 3,
            expiresInSeconds: 300,
          });
          expect(
            (await fetch(wrong.url, { method: 'PUT', headers: wrong.headers, body: 'bad' })).status,
          ).toBe(200);
          expect((await f.complete(file)).status).toBe(422);
          await f.put(file);
          const results = await Promise.all(Array.from({ length: 5 }, () => f.complete(file)));
          expect(results.map((response) => response.status)).toEqual([200, 200, 200, 200, 200]);
          for (const response of results) {
            // oxlint-disable-next-line no-await-in-loop -- Responses from concurrent requests are consumed once.
            const body = await response.json();
            expect(body).toEqual({
              fileId: file.fileId,
              fileRef: `${file.fileId}.${file.uploadToken}`,
              status: 'uploaded',
            });
            assertAllowedFields(body, ['fileId', 'fileRef', 'status']);
          }
          const jobs = await f.db.execute<{ n: number }>(
            "select count(*)::int as n from pgboss.job where name = 'uploads.scan'",
          );
          expect(jobs.rows[0]?.n).toBe(1);
          const usage = await f.use((tx) =>
            tx.repositories.usage.list(monthlyUsagePeriod(f.now())),
          );
          expect(usage.find((value) => value.metric === 'uploads.files')?.value).toBe(1n);
          expect(usage.find((value) => value.metric === 'uploads.bytes')?.value).toBe(
            BigInt(file.bytes.byteLength),
          );
          const foreign = await issueKey(f, f.a2.id, {
            kind: 'secret',
            name: 'Foreign project',
            scopes: ['uploads:create'],
            expiresAt: null,
          });
          expect(
            (
              await f.request(
                `/v1/public/files/${file.fileId}/complete`,
                { data: { uploadToken: file.uploadToken } },
                undefined,
                { authorization: `Bearer ${foreign.token}` },
              )
            ).status,
          ).toBe(404);
          expect(f.logs.join('')).not.toContain(file.uploadToken);
          expect(f.logs.join('')).not.toContain(file.uploadUrl);
          expect(await f.storage.head(row!.storageKey)).toBeNull();
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
  'upload intents enforce protected defaults, current zone policy, public proofs and transactional rollback',
  async () => {
    await scenario(
      async (base) => {
        const f = await prepareUploads(base);
        try {
          expect(
            (await f.request(f.zonePath, { key: 'protected', name: 'Protected' }, f.owner.cookie))
              .status,
          ).toBe(201);
          expect(
            (
              await f.request(
                '/v1/public/upload-zones/protected/files',
                { data: { name: 'a.png', size: 3, type: 'image/png' } },
                undefined,
                f.headers,
              )
            ).status,
          ).toBe(422);
          const path = `/v1/public/upload-zones/cv/files?key=${f.publishable.token}`;
          const headers = { origin: f.origin };
          expect(
            (
              await f.request(
                path,
                { data: { name: 'cv.pdf', size: 4, type: 'application/pdf' } },
                undefined,
                headers,
              )
            ).status,
          ).toBe(400);
          expect(
            (
              await f.request(
                `/v1/projects/${f.a1.id}`,
                { allowedOrigins: [f.origin] },
                f.owner.cookie,
                undefined,
                'PATCH',
              )
            ).status,
          ).toBe(200);
          expect(
            (
              await f.request(
                path,
                { data: { name: 'cv.pdf', size: 4, type: 'application/pdf' } },
                undefined,
                { origin: 'https://other.test' },
              )
            ).status,
          ).toBe(403);
          const challenge = altchaChallengeSchema.parse(
            await (
              await f.request(
                `/v1/public/challenge?key=${f.publishable.token}`,
                undefined,
                undefined,
                headers,
              )
            ).json(),
          );
          const solution = await solveChallenge({ challenge, deriveKey, timeout: 10_000 });
          const browser = await f.request(
            path,
            {
              data: { name: 'cv.pdf', size: 4, type: 'application/pdf' },
              proof: { challenge, solution },
            },
            undefined,
            headers,
          );
          expect(browser.status).toBe(200);
          const intent = uploadIntentResponseSchema.parse(await browser.json());
          expect(intent.uploadToken).toStartWith('bbu_');
          const file = await f.intent();
          await f.put(file);
          await f.db.execute(
            "alter table pgboss.job add constraint fixture_upload_enqueue_failure check (name <> 'uploads.scan') not valid",
          );
          expect((await f.complete(file)).status).toBe(500);
          expect(
            (await f.use(async (tx) => tx.modules.uploads?.get(file.fileId, f.now())))?.status,
          ).toBe('pending');
          await f.db.execute(
            'alter table pgboss.job drop constraint fixture_upload_enqueue_failure',
          );
          const config = instanceResponseSchema.parse(
            await (await f.request(`${f.zonePath}/cv`, undefined, f.owner.cookie)).json(),
          );
          expect(
            (
              await f.request(
                `${f.zonePath}/cv`,
                { configVersion: config.configVersion, config: { maxSizeMb: 2 } },
                f.owner.cookie,
                undefined,
                'PATCH',
              )
            ).status,
          ).toBe(200);
          expect((await f.complete(file)).status).toBe(409);
          expect(
            (
              await f.request(
                '/v1/public/upload-zones/cv/files',
                {
                  data: {
                    name: 'cv.pdf',
                    size: 4,
                    type: 'application/pdf',
                    metadata: { junk: 'x'.repeat(4096) },
                  },
                },
                undefined,
                f.headers,
              )
            ).status,
          ).toBe(413);
          expect(
            (
              await f.request(
                '/v1/public/upload-zones/cv/files',
                { data: { name: 'cv.pdf', size: 4, type: 'application/pdf' } },
                undefined,
                { ...f.headers, 'idempotency-key': 'no-credential-cache' },
              )
            ).status,
          ).toBe(400);
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
  'pending upload completion expires at the signed PUT boundary',
  async () => {
    let now = new Date();
    await scenario(
      async (base) => {
        const f = await prepareUploads(base);
        try {
          const file = await f.intent();
          now = new Date(Date.parse(file.expiresAt));
          expect((await f.complete(file)).status).toBe(404);
          expect(
            (await f.use(async (tx) => tx.modules.uploads?.get(file.fileId, f.now())))?.status,
          ).toBe('pending');
        } finally {
          await f.cleanup();
        }
      },
      uploadsEnvironment,
      { keyClock: { now: () => now }, durableDelivery: true, consumeJobs: false },
    );
  },
  30_000,
);
