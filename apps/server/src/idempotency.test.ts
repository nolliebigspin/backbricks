import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';

import { altchaChallengeSchema } from '@backbricks/adapters';
import {
  defineModuleCatalog,
  hashApiKey,
  monthlyUsagePeriod,
  secretKeyReferenceSchema,
  type SecretKeyReference,
} from '@backbricks/core';
import { createWithTenant } from '@backbricks/db';
import { solveChallenge } from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/sha';

import { available, scenario } from '../test/auth-fixture.ts';
import { prepareIsolationFixture } from '../test/isolation/setup.ts';
import { issueKey } from '../test/platform-read-fixture.ts';
import { publicModule } from '../test/public-module-fixture.ts';

const catalog = defineModuleCatalog([publicModule()]);
const storageKey = (key: string) => createHash('sha256').update(key).digest('hex');

test.skipIf(!available)(
  'idempotency serializes concurrent writes, scopes keys, expires safely and rolls back failed responses',
  async () => {
    let now = new Date();
    await scenario(
      async (base) => {
        const f = await prepareIsolationFixture(base);
        const withTenant = createWithTenant(f.db);
        const context = { organizationId: f.organizationId, projectId: f.a1.id };
        const setup = async (projectId: string) => {
          expect(
            (
              await f.request(
                `/v1/projects/${projectId}/entries`,
                { key: 'contact', name: 'Contact', config: { perMinute: 100 } },
                f.owner.cookie,
              )
            ).status,
          ).toBe(201);
          return issueKey(f, projectId, {
            kind: 'secret',
            name: 'Server',
            scopes: ['publictest:submit'],
            expiresAt: null,
          });
        };
        const secret = await setup(f.a1.id);
        const path = '/v1/public/entries/contact';
        const headers = {
          authorization: `Bearer ${secret.token}`,
          'idempotency-key': 'one-request',
        };
        const body = { data: { text: 'private original input' } };
        const responses = await Promise.all(
          Array.from({ length: 12 }, () => f.request(path, body, undefined, headers)),
        );
        expect(responses.map((response) => response.status)).toEqual(Array(12).fill(201));
        const values = await Promise.all(responses.map((response) => response.json()));
        expect(values.every((value) => JSON.stringify(value) === JSON.stringify(values[0]))).toBe(
          true,
        );
        const state = () =>
          withTenant(context, async (tx) => ({
            usage: await tx.repositories.usage.list(monthlyUsagePeriod(now)),
            events: await tx.repositories.events.pending(100),
            record: await tx.repositories.idempotency.get(storageKey('one-request'), now),
          }));
        const saved = await state();
        expect(saved.usage).toEqual([{ metric: 'publictest.accepted', value: 1n }]);
        expect(saved.events.filter((event) => event.type === 'publictest.created')).toHaveLength(1);
        expect(saved.record).toMatchObject({
          key: storageKey('one-request'),
          responseStatus: 201,
          responseBody: { accepted: true, status: 'clean' },
        });
        expect(saved.record?.requestHash.byteLength).toBe(32);
        expect(JSON.stringify(saved.record)).not.toContain('private original input');
        expect(JSON.stringify(saved.record)).not.toContain(secret.token);
        expect(
          (await f.request(path, { data: { text: 'different input' } }, undefined, headers)).status,
        ).toBe(409);
        expect(await state()).toEqual(saved);
        const sibling = await setup(f.a2.id);
        expect(
          (
            await f.request(path, body, undefined, {
              ...headers,
              authorization: `Bearer ${sibling.token}`,
            })
          ).status,
        ).toBe(201);
        expect((await state()).usage).toEqual(saved.usage);
        expect(
          (await f.request(path, body, undefined, { ...headers, 'idempotency-key': 'bad key' }))
            .status,
        ).toBe(422);
        await f.db.execute(
          "alter table events add constraint fixture_idempotency_failure check (type <> 'publictest.created') not valid",
        );
        const failedHeaders = { ...headers, 'idempotency-key': 'failed-request' };
        expect((await f.request(path, body, undefined, failedHeaders)).status).toBe(500);
        expect(
          await withTenant(context, (tx) =>
            tx.repositories.idempotency.get(storageKey('failed-request'), now),
          ),
        ).toBeNull();
        expect(await state()).toEqual(saved);
        await f.db.execute('alter table events drop constraint fixture_idempotency_failure');
        expect((await f.request(path, body, undefined, failedHeaders)).status).toBe(201);
        // Failure to save the successful response must also roll back its domain effects.
        await f.db.execute(
          'alter table idempotency_keys add constraint fixture_idempotency_cache_failure check (false) not valid',
        );
        const before = await state();
        expect(
          (
            await f.request(path, body, undefined, {
              ...headers,
              'idempotency-key': 'cache-failure',
            })
          ).status,
        ).toBe(500);
        expect(await state()).toEqual(before);
        await f.db.execute(
          'alter table idempotency_keys drop constraint fixture_idempotency_cache_failure',
        );
        now = new Date(now.getTime() + 86_400_000);
        expect(
          await withTenant(context, (tx) =>
            tx.repositories.idempotency.get(storageKey('one-request'), now),
          ),
        ).toBeNull();
        expect(
          (await f.request(path, { data: { text: 'after expiry' } }, undefined, headers)).status,
        ).toBe(201);
        expect((await state()).usage).toEqual([{ metric: 'publictest.accepted', value: 3n }]);
      },
      { BACKBRICKS_MODULES: 'publictest' },
      { catalog, keyClock: { now: () => now } },
    );
  },
  30_000,
);

test.skipIf(!available)(
  'committed public retries replay with a spent proof while mismatched requests still conflict',
  async () => {
    const directory = new Map<string, SecretKeyReference>();
    await scenario(
      async (base) => {
        const f = await prepareIsolationFixture(base);
        expect(
          (
            await f.request(
              `/v1/projects/${f.a1.id}/entries`,
              { key: 'contact', name: 'Contact' },
              f.owner.cookie,
            )
          ).status,
        ).toBe(201);
        const pk = await issueKey(f, f.a1.id, {
          kind: 'publishable',
          name: 'Browser',
          expiresAt: null,
        });
        directory.set(
          Buffer.from(await hashApiKey(pk.token)).toString('hex'),
          secretKeyReferenceSchema.parse({
            id: pk.id,
            organizationId: f.organizationId,
            projectId: f.a1.id,
          }),
        );
        const path = `/v1/public/entries/contact?key=${pk.token}`;
        const challenge = altchaChallengeSchema.parse(
          await (await f.request(`/v1/public/challenge?key=${pk.token}`)).json(),
        );
        const solution = await solveChallenge({ challenge, deriveKey, timeout: 10_000 });
        const headers = { 'idempotency-key': 'browser-retry' };
        const body = { data: { text: 'hello' }, proof: { challenge, solution } };
        expect((await f.request(path, body, undefined, headers)).status).toBe(201);
        const before = await f.snapshot();
        const replay = await f.request(path, body, undefined, headers);
        expect(replay.status).toBe(201);
        expect(await replay.json()).toEqual({ accepted: true, status: 'clean' });
        expect(
          (await f.request(path, { data: { text: 'hello' } }, undefined, headers)).status,
        ).toBe(201);
        expect(
          (await f.request(path, { data: { text: 'changed' } }, undefined, headers)).status,
        ).toBe(409);
        expect(await f.snapshot()).toEqual(before);
        expect(
          (
            await f.request(
              `/v1/projects/${f.a1.id}/keys/${pk.id}`,
              undefined,
              f.owner.cookie,
              undefined,
              'DELETE',
            )
          ).status,
        ).toBe(204);
        expect((await f.request(path, body, undefined, headers)).status).toBe(404);
      },
      { BACKBRICKS_MODULES: 'publictest' },
      {
        catalog,
        lookupPublishable: (hash) =>
          Promise.resolve(directory.get(Buffer.from(hash).toString('hex')) ?? null),
      },
    );
  },
  30_000,
);
