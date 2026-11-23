import { expect, test } from 'bun:test';

import { platformMetaSchema } from '@backbricks/core';
import { z } from 'zod';

import { available, idResponseSchema, scenario } from '../test/auth-fixture.ts';
import { solvedProof } from '../test/forms-fixture.ts';
import { prepareIsolationFixture } from '../test/isolation/setup.ts';
import { issueKey } from '../test/platform-read-fixture.ts';
import { createReviewFixture, reviewAnswers } from '../test/reviews-fixture.ts';
import { moduleRepositories } from './module-repositories.ts';
import { moduleCatalog } from './modules.ts';

test.skipIf(!available)(
  'Reviews runs with Postgres alone and publishes only explicitly approved and visible data',
  async () => {
    await scenario(
      async (base) => {
        const f = await prepareIsolationFixture(base);
        const r = await createReviewFixture(f);
        const meta = platformMetaSchema.parse(await (await f.request('/v1/meta')).json());
        expect(meta.modules.filter((entry) => entry.operational).map(({ type }) => type)).toEqual([
          'reviews',
        ]);
        const path = `${r.publicRoot}/reviews?key=${r.publishable.token}`;
        const get = (route = path, headers?: Record<string, string>) =>
          f.request(route, undefined, undefined, headers);
        const proof = await solvedProof(f, r.publishable.token);
        const accepted = await f.request(path, { data: reviewAnswers, proof }, undefined, {
          'idempotency-key': 'fixture-review',
        });
        expect(accepted.status).toBe(200);
        const json: unknown = await accepted.json();
        const { id } = idResponseSchema.parse(json);
        expect(json).toEqual({ id });
        expect(
          await (
            await f.request(path, { data: reviewAnswers, proof }, undefined, {
              'idempotency-key': 'fixture-review',
            })
          ).json(),
        ).toEqual({ id });
        expect(
          await (await f.request(path, { data: reviewAnswers, honeypot: 'filled' })).json(),
        ).toEqual({ accepted: true });
        expect(await (await get()).json()).toEqual({ data: [], nextCursor: null });
        expect((await r.moderate(id, 'publish')).status).toBe(409);
        expect((await r.moderate(id, 'approve')).status).toBe(200);
        expect(await (await get()).json()).toEqual({ data: [], nextCursor: null });
        expect((await r.moderate(id, 'publish')).status).toBe(200);
        const testId = await r.seed({ ...reviewAnswers, rating: 5 });
        await f.db.execute(
          `update reviews set is_test = true, moderation_status = 'approved', published_at = created_at where id = '${testId}'`,
        );
        expect((await r.moderate(testId, 'publish')).status).toBe(409);
        const response = await get(path, { origin: 'https://site.test' });
        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('public, no-cache');
        const etag = response.headers.get('etag') ?? '';
        expect(etag).toMatch(/^W\/"[a-f0-9]{64}"$/);
        const publicData = await response.json();
        expect(publicData).toEqual({
          data: [
            {
              id,
              rating: 4,
              title: 'Great service',
              body: 'Thanks for the help.',
              displayName: 'Ada L.',
              fields: { company: 'Analytical Engines' },
              publishedAt: expect.any(String),
            },
          ],
          nextCursor: null,
        });
        const unchanged = await get(path, {
          origin: 'https://site.test',
          'if-none-match': `"unrelated,quoted", ${etag.slice(2)}`,
        });
        expect(unchanged.status).toBe(304);
        expect(await unchanged.text()).toBe('');
        expect(unchanged.headers.get('etag')).toBe(etag);
        expect(unchanged.headers.get('vary')).toBe('Origin, Authorization');
        expect(unchanged.headers.get('access-control-allow-origin')).toBe('https://site.test');
        expect((await get(path, { 'if-none-match': '*' })).status).toBe(304);
        expect((await get(path, { 'if-none-match': '"invalid"' })).status).toBe(200);
        const stats = `${r.publicRoot}/stats?key=${r.publishable.token}`;
        const statsRes = await get(stats);
        expect(await statsRes.json()).toEqual({
          ratingScale: 5,
          count: 1,
          average: 4,
          distribution: [1, 2, 3, 4, 5].map((rating) => ({ rating, count: Number(rating === 4) })),
        });
        expect(
          (await get(stats, { 'if-none-match': statsRes.headers.get('etag') ?? '' })).status,
        ).toBe(304);
        const preflight = await f.request(
          path,
          undefined,
          undefined,
          {
            origin: 'https://site.test',
            'access-control-request-method': 'GET',
            'access-control-request-headers': 'if-none-match',
          },
          'OPTIONS',
        );
        expect(preflight.status).toBe(204);
        expect(preflight.headers.get('access-control-allow-headers')).toContain('if-none-match');
        const originChange = await f.request(
          `/v1/projects/${f.a1.id}`,
          { allowedOrigins: ['https://new-site.test'] },
          f.owner.cookie,
          undefined,
          'PATCH',
        );
        expect(originChange.status).toBe(200);
        expect(
          (await get(path, { origin: 'https://site.test', 'if-none-match': etag })).status,
        ).toBe(403);
        expect((await r.moderate(id, 'unpublish')).status).toBe(200);
        const refreshed = await get(path, {
          origin: 'https://new-site.test',
          'if-none-match': etag,
        });
        expect(refreshed.status).toBe(200);
        expect(refreshed.headers.get('etag')).not.toBe(etag);
        expect(await refreshed.json()).toEqual({ data: [], nextCursor: null });
        const revoked = await f.request(
          `/v1/projects/${f.a1.id}/keys/${r.publishable.id}`,
          undefined,
          f.owner.cookie,
          undefined,
          'DELETE',
        );
        expect(revoked.status).toBe(204);
        expect(
          (await get(path, { origin: 'https://new-site.test', 'if-none-match': '*' })).status,
        ).toBe(404);
      },
      { BACKBRICKS_MODULES: 'reviews', SCANNER: 'none' },
    );
  },
  30_000,
);

test.skipIf(!available)(
  'rating cursors survive a removed anchor and cannot be reused with another sort',
  async () => {
    await scenario(
      async (base) => {
        const f = await prepareIsolationFixture(base);
        const r = await createReviewFixture(f);
        const first = await r.seed({ ...reviewAnswers, rating: 3 });
        const second = await r.seed({ ...reviewAnswers, rating: 3 });
        const third = await r.seed({ ...reviewAnswers, rating: 1 });
        for (const id of [first, second, third]) {
          // oxlint-disable-next-line no-await-in-loop -- A review must be approved before it is published.
          expect((await r.moderate(id, 'approve')).status).toBe(200);
          // oxlint-disable-next-line no-await-in-loop -- A review must be approved before it is published.
          expect((await r.moderate(id, 'publish')).status).toBe(200);
        }
        await f.db.execute('update reviews set published_at = transaction_timestamp()');
        const stats = await f.request(`${r.publicRoot}/stats?key=${r.publishable.token}`);
        expect(await stats.json()).toEqual({
          ratingScale: 5,
          count: 3,
          average: 2.33,
          distribution: [1, 0, 2, 0, 0].map((count, index) => ({ rating: index + 1, count })),
        });
        const root = `${r.publicRoot}/reviews?key=${r.publishable.token}&limit=1`;
        const result = z
          .object({ data: z.array(z.unknown()), nextCursor: z.string() })
          .parse(await (await f.request(`${root}&sort=rating_desc`)).json());
        expect(result).toMatchObject({ data: [{ id: second }], nextCursor: expect.any(String) });
        const cursor = encodeURIComponent(result.nextCursor);
        expect((await f.request(`${root}&sort=rating_asc&cursor=${cursor}`)).status).toBe(422);
        expect((await f.request(`${root}&sort=rating_desc&cursor=broken`)).status).toBe(422);
        // Tie fixtures must have the same precision as normal writes from the injected clock.
        await f.db.execute(
          "update reviews set published_at = date_trunc('milliseconds', published_at)",
        );
        const fixed = z
          .object({ nextCursor: z.string() })
          .parse(await (await f.request(`${root}&sort=rating_desc`)).json());
        expect(
          (
            await f.request(
              `${r.recordRoot}/${second}`,
              undefined,
              f.member.cookie,
              undefined,
              'DELETE',
            )
          ).status,
        ).toBe(204);
        expect(
          await (
            await f.request(
              `${root}&sort=rating_desc&cursor=${encodeURIComponent(fixed.nextCursor)}`,
            )
          ).json(),
        ).toMatchObject({ data: [{ id: first }], nextCursor: expect.any(String) });
        expect(await (await f.request(`${root}&sort=rating_asc`)).json()).toMatchObject({
          data: [{ id: third }],
        });
      },
      { BACKBRICKS_MODULES: 'reviews' },
    );
  },
  30_000,
);

test.skipIf(!available)(
  'review writes keep private fields out of errors, logs and write-only key responses',
  async () => {
    await scenario(
      async (base) => {
        const f = await prepareIsolationFixture(base);
        const r = await createReviewFixture(f);
        const rejected = await r.submit({ ...reviewAnswers, body: 'bad\0body' });
        expect(rejected.status).toBe(422);
        expect(
          (await r.submit({ ...reviewAnswers, title: String.fromCharCode(0xd800) })).status,
        ).toBe(422);
        const malicious = z.record(z.string(), z.string()).parse({ company: 'Example' });
        Object.defineProperty(malicious, '__proto__', {
          value: 'not a configured field',
          enumerable: true,
        });
        expect(
          (await r.submit({ ...reviewAnswers, fields: { ...reviewAnswers.fields, ...malicious } }))
            .status,
        ).toBe(422);
        await f.db.execute(
          'alter table reviews add constraint fixture_review_storage_failure check (rating <> 4) not valid',
        );
        expect((await r.submit()).status).toBe(500);
        expect(f.logs.join('\n')).not.toContain(reviewAnswers.email);
        expect(f.logs.join('\n')).not.toContain(reviewAnswers.fields.reference);
        await f.db.execute('alter table reviews drop constraint fixture_review_storage_failure');
        const id = await r.seed();
        const key = await issueKey(f, f.a1.id, {
          kind: 'secret',
          name: 'Write-only moderator',
          scopes: ['data:write'],
          expiresAt: null,
        });
        const headers = { authorization: `Bearer ${key.token}` };
        const path = `${r.recordRoot}/${id}`;
        for (const action of ['approve', 'approve']) {
          // oxlint-disable-next-line no-await-in-loop -- Effective and repeat actions must both preserve the scope boundary.
          const response = await f.request(path, { action }, undefined, headers, 'PATCH');
          expect(response.status).toBe(200);
          // oxlint-disable-next-line no-await-in-loop -- See above.
          expect(await response.json()).toEqual({
            id,
            moderationStatus: 'approved',
            publishedAt: null,
          });
        }
        expect((await f.request(path, undefined, undefined, headers)).status).toBe(403);
        const options = await f.request(
          `/v1/projects/${f.a1.id}/notification-rules/options`,
          undefined,
          f.admin.cookie,
        );
        expect(options.status).toBe(200);
        expect(await options.json()).toMatchObject({ events: [] });
      },
      { BACKBRICKS_MODULES: 'reviews' },
    );
  },
  30_000,
);

test.skipIf(!available)(
  'a visibility change racing with publication cannot expose the old public fields',
  async () => {
    const entered = Promise.withResolvers<void>();
    const resume = Promise.withResolvers<void>();
    const bind = moduleRepositories(moduleCatalog.select(['reviews']));
    let pause = true;

    await scenario(
      async (base) => {
        const f = await prepareIsolationFixture(base);
        const r = await createReviewFixture(f);
        const draft = await r.seed();
        expect((await r.moderate(draft, 'approve')).status).toBe(200);
        const route = `${r.publicRoot}/reviews?key=${r.publishable.token}`;
        const pending = f.request(route);
        try {
          await entered.promise;
          const collection = `${r.collectionRoot}/${r.collection.key}`;
          const narrowed = await f.request(
            collection,
            {
              configVersion: r.collection.configVersion,
              config: {
                fields: [
                  { key: 'company', label: 'Company' },
                  { key: 'reference', label: 'Reference' },
                ],
              },
            },
            f.owner.cookie,
            undefined,
            'PUT',
          );
          expect(narrowed.status).toBe(200);
          expect((await r.moderate(draft, 'publish')).status).toBe(200);
        } finally {
          resume.resolve();
        }
        expect((await pending).status).toBe(409);
        const clean = await f.request(route);
        expect(clean.status).toBe(200);
        expect(await clean.json()).toMatchObject({ data: [{ id: draft, fields: {} }] });
        expect(
          await (
            await f.request(
              `${r.collectionRoot}/${r.collection.key}`,
              {
                configVersion: r.collection.configVersion + 1,
                config: { ratingScale: 10 },
              },
              f.owner.cookie,
              undefined,
              'PATCH',
            )
          ).json(),
        ).toMatchObject({
          code: 'validation_failed',
        });
      },
      { BACKBRICKS_MODULES: 'reviews' },
      {
        moduleRepositories: (...args) => {
          const bound = bind(...args);
          const reviews = bound.reviews;
          if (!reviews) return bound;
          return {
            ...bound,
            reviews: {
              ...reviews,
              async listPublished(...params: Parameters<typeof reviews.listPublished>) {
                if (pause) {
                  pause = false;
                  entered.resolve();
                  await resume.promise;
                }
                return reviews.listPublished(...params);
              },
            },
          };
        },
      },
    );
  },
  30_000,
);
