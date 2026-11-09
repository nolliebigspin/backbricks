import { expect, test } from 'bun:test';

import { altchaChallengeSchema } from '@backbricks/adapters';
import {
  defineModuleCatalog,
  hashApiKey,
  secretKeyReferenceSchema,
  type SecretKeyReference,
} from '@backbricks/core';
import { solveChallenge } from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/sha';

import { available, scenario } from '../test/auth-fixture.ts';
import { prepareIsolationFixture } from '../test/isolation/setup.ts';
import { issueKey } from '../test/platform-read-fixture.ts';
import { publicModule } from '../test/public-module-fixture.ts';

const catalog = defineModuleCatalog([publicModule()]);
test.skipIf(!available)(
  'public guard enforces cheap-first checks, proof, scopes, CORS, strict schema and transaction safety',
  async () => {
    const directory = new Map<string, SecretKeyReference>();
    await scenario(
      async (base) => {
        const f = await prepareIsolationFixture(base);
        const pk = await issueKey(f, f.a1.id, {
          kind: 'publishable',
          name: 'Public',
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
        const project = `/v1/projects/${f.a1.id}`;
        expect(
          (
            await f.request(
              `${project}/entries`,
              { key: 'contact', name: 'Contact', config: { perMinute: 100 } },
              f.owner.cookie,
            )
          ).status,
        ).toBe(201);
        const path = `/v1/public/entries/contact?key=${pk.token}`;
        const headers = { origin: 'https://site.test' };
        const html = await fetch(`${base.origin}${path}`, {
          method: 'POST',
          headers: { ...headers, 'content-type': 'application/x-www-form-urlencoded' },
          body: 'text=hello',
        });
        expect(html.status).toBe(415);
        expect(html.headers.get('content-type')).toContain('application/problem+json');
        const before = await f.snapshot();
        const honey = await f.request(
          path,
          { data: { unexpected: 'ignored' }, honeypot: 'bot' },
          undefined,
          headers,
        );
        expect(honey.status).toBe(200);
        expect(await honey.json()).toMatchSnapshot();
        expect(await f.snapshot()).toEqual(before);
        expect(honey.headers.get('access-control-allow-origin')).toBe(headers.origin);
        expect(honey.headers.get('access-control-allow-credentials')).toBeNull();
        expect(
          (await f.request(path, { data: { text: 'hello' } }, undefined, headers)).status,
        ).toBe(400);
        const challenge = altchaChallengeSchema.parse(
          await (
            await f.request(`/v1/public/challenge?key=${pk.token}`, undefined, undefined, headers)
          ).json(),
        );
        const solution = await solveChallenge({ challenge, deriveKey, timeout: 10_000 });
        const valid = await f.request(
          path,
          { data: { text: 'hello' }, proof: { challenge, solution } },
          undefined,
          headers,
        );
        expect(valid.status).toBe(201);
        expect(await valid.json()).toMatchSnapshot();
        expect(
          (
            await f.request(
              path,
              { data: { text: 'replay' }, proof: { challenge, solution } },
              undefined,
              headers,
            )
          ).status,
        ).toBe(400);
        const secret = await issueKey(f, f.a1.id, {
          kind: 'secret',
          name: 'Server',
          scopes: ['publictest:submit'],
          expiresAt: null,
        });
        const secretHeaders = { authorization: `Bearer ${secret.token}` };
        expect(
          (
            await f.request(
              '/v1/public/entries/contact',
              { data: { text: 'hello' } },
              undefined,
              secretHeaders,
            )
          ).status,
        ).toBe(201);
        const invalid = await f.request(
          '/v1/public/entries/contact',
          { data: { text: 'hello', extra: true } },
          undefined,
          secretHeaders,
        );
        expect(invalid.status).toBe(422);
        expect(await invalid.json()).toMatchObject({
          code: 'validation_failed',
          errors: [{ path: 'body', code: 'unrecognized_keys' }],
        });
        const spam = await f.request(
          '/v1/public/entries/contact',
          { data: { text: 'https://x.test '.repeat(11) } },
          undefined,
          secretHeaders,
        );
        expect(await spam.json()).toEqual({ accepted: true, status: 'spam' });
        const wrongScope = await issueKey(f, f.a1.id, {
          kind: 'secret',
          name: 'Read only',
          scopes: ['config:read'],
          expiresAt: null,
        });
        expect(
          (
            await f.request('/v1/public/entries/contact', { data: { text: 'hello' } }, undefined, {
              authorization: `Bearer ${wrongScope.token}`,
            })
          ).status,
        ).toBe(403);
        const preflight = (
          origin: string,
          method = 'POST',
          extra = 'content-type, idempotency-key',
        ) =>
          f.request(
            path,
            undefined,
            undefined,
            {
              origin,
              'access-control-request-method': method,
              'access-control-request-headers': extra,
            },
            'OPTIONS',
          );
        expect((await preflight(headers.origin)).status).toBe(204);
        expect((await preflight(headers.origin)).headers.get('vary')).toContain(
          'Access-Control-Request-Headers',
        );
        expect((await preflight('null')).status).toBe(403);
        expect((await preflight(headers.origin, 'DELETE')).status).toBe(403);
        expect((await preflight(headers.origin, 'POST', 'x-secret')).status).toBe(403);
        expect(
          (await f.request(project, undefined, f.owner.cookie, headers)).headers.get(
            'access-control-allow-origin',
          ),
        ).toBeNull();
        expect(
          (
            await f.request(
              project,
              { allowedOrigins: [headers.origin] },
              f.owner.cookie,
              undefined,
              'PATCH',
            )
          ).status,
        ).toBe(200);
        expect((await f.request(path, { data: {}, honeypot: 'bot' })).status).toBe(403);
        expect((await preflight('https://foreign.test')).status).toBe(403);
        expect(
          (await f.request(path, { data: {}, honeypot: 'bot' }, undefined, headers)).status,
        ).toBe(200);
        expect(
          (
            await f.request(
              `${project}/entries/contact`,
              { configVersion: 1, config: { bodyLimitBytes: 100, perMinute: 2 } },
              f.owner.cookie,
              undefined,
              'PATCH',
            )
          ).status,
        ).toBe(200);
        expect(
          (await f.request(path, { data: { text: 'x'.repeat(200) } }, undefined, headers)).status,
        ).toBe(413);
        // Honeypots count against the same rate buckets, so they cannot bypass the limiter.
        expect(
          (await f.request(path, { data: {}, honeypot: 'bot' }, undefined, headers)).status,
        ).toBe(429);
        await f.db.execute(
          "alter table events add constraint fixture_public_failure check (type <> 'publictest.created') not valid",
        );
        // Restore a larger rate allowance for the atomic failure assertion.
        expect(
          (
            await f.request(
              `${project}/entries/contact`,
              { configVersion: 2, config: { perMinute: 100 } },
              f.owner.cookie,
              undefined,
              'PATCH',
            )
          ).status,
        ).toBe(200);
        const failureBefore = await f.snapshot();
        expect(
          (
            await f.request(
              '/v1/public/entries/contact',
              { data: { text: 'rollback' } },
              undefined,
              secretHeaders,
            )
          ).status,
        ).toBe(500);
        expect(await f.snapshot()).toEqual(failureBefore);
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

test.skipIf(!available)(
  'requests rejected by origin or per-client limits never consume shared project/global buckets',
  async () => {
    const directory = new Map<string, SecretKeyReference>();
    await scenario(
      async (base) => {
        const f = await prepareIsolationFixture(base);
        const pk = await issueKey(f, f.a1.id, {
          kind: 'publishable',
          name: 'Public',
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
        const project = `/v1/projects/${f.a1.id}`;
        const site = { origin: 'https://site.test' };
        expect(
          (
            await f.request(
              `${project}/entries`,
              { key: 'contact', name: 'Contact', config: { perMinute: 2 } },
              f.owner.cookie,
            )
          ).status,
        ).toBe(201);
        expect(
          (
            await f.request(
              project,
              { allowedOrigins: [site.origin] },
              f.owner.cookie,
              undefined,
              'PATCH',
            )
          ).status,
        ).toBe(200);
        const path = `/v1/public/entries/contact?key=${pk.token}`;
        const honeypot = { data: {}, honeypot: 'bot' };
        const shared = async () => {
          const rows = await f.db.execute<{ namespace: string; count: number }>(
            "select split_part(bucket, ':', 1) as namespace, count from rate_limit_buckets where bucket like 'public.project:%' or bucket like 'public.global:%'",
          );
          return Object.fromEntries(rows.rows.map((row) => [row.namespace, row.count]));
        };

        // A disallowed origin is rejected before any bucket is touched.
        for (let i = 0; i < 3; i++) {
          // oxlint-disable-next-line no-await-in-loop -- Requests must hit the limiter in order.
          const foreign = await f.request(path, honeypot, undefined, {
            origin: 'https://foreign.test',
          });
          expect(foreign.status).toBe(403);
        }
        expect(await shared()).toEqual({});

        // Only the two requests admitted by the per-client limit reach the shared buckets.
        const statuses: number[] = [];
        for (let i = 0; i < 6; i++) {
          // oxlint-disable-next-line no-await-in-loop -- Requests must hit the limiter in order.
          statuses.push((await f.request(path, honeypot, undefined, site)).status);
        }
        expect(statuses).toEqual([200, 200, 429, 429, 429, 429]);
        expect(await shared()).toEqual({ 'public.project': 2, 'public.global': 2 });
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

test.skipIf(!available)(
  'public writes reject quota, oversized chunked input and limiter outages before domain effects',
  async () => {
    await scenario(
      async (base) => {
        const f = await prepareIsolationFixture(base);
        const project = `/v1/projects/${f.a1.id}`;
        expect(
          (
            await f.request(
              `${project}/entries`,
              { key: 'contact', name: 'Contact', config: { bodyLimitBytes: 100 } },
              f.owner.cookie,
            )
          ).status,
        ).toBe(201);
        const secret = await issueKey(f, f.a1.id, {
          kind: 'secret',
          name: 'Server',
          scopes: ['publictest:submit'],
          expiresAt: null,
        });
        const headers = {
          authorization: `Bearer ${secret.token}`,
          'content-type': 'application/json',
        };
        const path = '/v1/public/entries/contact';
        expect(
          (await f.request('/v1/public/challenge', undefined, undefined, headers)).status,
        ).toBe(200);
        const before = await f.snapshot();
        const denied = await f.request(path, { data: { text: 'hello' } }, undefined, headers);
        expect(denied.status).toBe(402);
        expect(await denied.json()).toMatchObject({ code: 'quota_exceeded' });
        expect(await f.snapshot()).toEqual(before);
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('{"data":{"text":"' + 'x'.repeat(200)));
            controller.close();
          },
        });
        const oversized = await fetch(`${f.origin}${path}`, {
          method: 'POST',
          headers,
          body: stream,
        });
        expect(oversized.status).toBe(413);
        expect(await f.snapshot()).toEqual(before);
        await f.db.execute(
          'alter table rate_limit_buckets rename to unavailable_rate_limit_buckets',
        );
        expect(
          (await f.request(path, { data: {}, honeypot: 'bot' }, undefined, headers)).status,
        ).toBe(503);
        expect(await f.snapshot()).toEqual(before);
      },
      { BACKBRICKS_MODULES: 'publictest' },
      {
        catalog,
        entitlements: { check: async () => ({ allowed: false, limit: 0n, remaining: 0n }) },
      },
    );
  },
  30_000,
);
