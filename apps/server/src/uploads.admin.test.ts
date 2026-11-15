import { expect, test } from 'bun:test';

import { instanceResponseSchema } from '@backbricks/core';
import { fileDetailSchema, filesPageSchema, storageUsageSchema } from '@backbricks/module-uploads';

import { scenario } from '../test/auth-fixture.ts';
import { instanceIsolationCases } from '../test/isolation/instance-cases.ts';
import { createKeyProbes } from '../test/isolation/keys.ts';
import {
  assertIsolationCoverage,
  exerciseIsolation,
  exerciseKeyIsolation,
} from '../test/isolation/suite.ts';
import { uploadsIsolationCases } from '../test/isolation/uploads-cases.ts';
import { issueKey } from '../test/platform-read-fixture.ts';
import { prepareUploads, uploadsAvailable, uploadsEnvironment } from '../test/uploads-fixture.ts';

test.skipIf(!uploadsAvailable)(
  'file reads project safe metadata and apply literal search, zone/status/date filters, pagination and inactive visibility',
  async () => {
    await scenario(
      async (base) => {
        const f = await prepareUploads(base);
        try {
          const ready = await f.ready('100%_!.pdf');
          const pending = await f.intent('pending.pdf');
          const root = `/v1/projects/${f.a1.id}`;
          const read = async (query = '') => {
            const response = await f.request(`${root}/files${query}`, undefined, f.member.cookie);
            expect(response.status).toBe(200);
            return filesPageSchema.parse(await response.json());
          };
          const detail = await f.request(
            `${root}/files/${ready.fileId}`,
            undefined,
            f.member.cookie,
          );
          expect(detail.status).toBe(200);
          const parsed = fileDetailSchema.parse(await detail.json());
          expect(parsed).toMatchObject({
            name: '100%_!.pdf',
            status: 'ready',
            scanStatus: 'not_scanned',
            owner: null,
            metadata: {},
          });
          const raw = JSON.stringify(parsed);
          for (const privateValue of [
            ready.uploadToken,
            'stg/',
            'fil/',
            'uploadTokenHash',
            'scanAttempts',
          ])
            expect(raw).not.toContain(privateValue);
          expect((await read('?q=%25_%21')).data.map((file) => file.id)).toEqual([ready.fileId]);
          expect((await read('?status=pending')).data.map((file) => file.id)).toEqual([
            pending.fileId,
          ]);
          expect(
            (await read('?from=2000-01-01T00:00:00.000Z&to=2001-01-01T00:00:00.000Z')).data,
          ).toEqual([]);
          expect(
            (
              await f.request(
                `${root}/files?from=2027-01-01T00:00:00Z&to=2026-01-01T00:00:00Z`,
                undefined,
                f.member.cookie,
              )
            ).status,
          ).toBe(422);
          const zone = instanceResponseSchema.parse(
            await (await f.request(`${f.zonePath}/cv`, undefined, f.member.cookie)).json(),
          );
          expect((await read(`?zoneId=${zone.id}`)).data).toHaveLength(2);
          const first = await read('?limit=1');
          expect(first.nextCursor).not.toBeNull();
          const second = await read(`?limit=1&cursor=${first.nextCursor}`);
          expect(new Set([...first.data, ...second.data].map((file) => file.id)).size).toBe(2);
          expect(second.nextCursor).toBeNull();
          await Promise.all(
            [`${root}/files`, `${root}/files/${ready.fileId}`, `${root}/storage-usage`].map(
              async (path) => {
                expect((await f.request(path)).status).toBe(401);
                expect((await f.request(path, undefined, f.other.cookie)).status).toBe(404);
                expect((await f.request(path, undefined, undefined, f.headers)).status).toBe(403);
                expect(
                  (
                    await f.request(path, undefined, undefined, {
                      authorization: `Bearer ${f.publishable.token}`,
                    })
                  ).status,
                ).toBe(403);
              },
            ),
          );
          const readKey = await issueKey(f, f.a1.id, {
            kind: 'secret',
            name: 'Data read',
            scopes: ['data:read'],
            expiresAt: null,
          });
          expect(
            (
              await f.request(`${root}/files`, undefined, undefined, {
                authorization: `Bearer ${readKey.token}`,
              })
            ).status,
          ).toBe(200);
          expect(
            (
              await f.request(`${root}/storage-usage`, undefined, undefined, {
                authorization: `Bearer ${readKey.token}`,
              })
            ).status,
          ).toBe(403);
          await f.use(async (tx) => {
            const repo = tx.modules.uploads;
            if (!repo) throw new Error('Missing repository');
            const file = await repo.get(ready.fileId, f.now());
            await repo.patch(ready.fileId, {
              expiresAt: new Date(file.createdAt.getTime() + 1),
              updatedAt: f.now(),
            });
            await repo.patch(pending.fileId, {
              deletedAt: f.now(),
              cleanupAfter: f.now(),
              updatedAt: f.now(),
            });
          });
          expect(
            (await f.request(`${root}/files/${ready.fileId}`, undefined, f.member.cookie)).status,
          ).toBe(404);
          expect(
            (await f.request(`${root}/files/${pending.fileId}`, undefined, f.member.cookie)).status,
          ).toBe(404);
          expect((await read()).data).toEqual([]);
          const usage = storageUsageSchema.parse(
            await (await f.request(`${root}/storage-usage`, undefined, f.member.cookie)).json(),
          );
          expect(usage.count).toBe('0');
          expect(BigInt(usage.reservedBytes)).toBeGreaterThan(0n);
          expect(usage.storedBytes).toBe('0');
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
  'every uploads management route has concrete cookie/key isolation and immutable foreign-denial snapshots',
  async () => {
    await scenario(
      async (base) => {
        const f = await prepareUploads(base);
        try {
          const cases = {
            ...(await instanceIsolationCases(f, { type: 'uploads', plural: 'upload-zones' })),
            ...(await uploadsIsolationCases(f)),
          };
          const operations = f.manifest().flatMap((row) =>
            row.policy.kind === 'management' && row.policy.isolationCase.startsWith('uploads.')
              ? [
                  {
                    method: row.method,
                    path: row.path,
                    isolationCase: row.policy.isolationCase,
                    secretKeyScope: row.policy.secretKey?.scope,
                  },
                ]
              : [],
          );
          expect(operations).toHaveLength(16);
          assertIsolationCoverage(operations, cases);
          const keys = createKeyProbes(f);
          for (const operation of operations) {
            const entry = cases[operation.isolationCase];
            if (!entry) throw new Error('Missing uploads isolation case');
            if (operation.secretKeyScope) {
              // oxlint-disable-next-line no-await-in-loop -- Key denials precede each stateful cookie acceptance.
              await exerciseKeyIsolation(f, entry, () => f.snapshot(), operation, keys);
            }
            // oxlint-disable-next-line no-await-in-loop -- Generic configuration revisions depend on prior acceptance.
            await exerciseIsolation(f, entry, () => f.snapshot(), operation);
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

test('storage wire values preserve arbitrary integer precision', () => {
  expect(
    storageUsageSchema.parse({
      count: '9007199254740993',
      storedBytes: '9007199254740995',
      reservedBytes: '9223372036854775807',
    }).storedBytes,
  ).toBe('9007199254740995');
});
