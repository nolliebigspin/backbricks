import { expect, test } from 'bun:test';

import { MILLISECONDS_PER_DAY, PLATFORM_JOBS, subjectExportResponseSchema } from '@backbricks/core';

import { eventually } from '../../../scripts/test/eventually.ts';
import { available, scenario } from '../test/auth-fixture.ts';
import { prepareIsolationFixture } from '../test/isolation/setup.ts';
import { createReviewFixture, reviewAnswers } from '../test/reviews-fixture.ts';

test.skipIf(!available)(
  'review moderation audits atomically and subject erasure removes published content',
  async () => {
    await scenario(
      async (base) => {
        const f = await prepareIsolationFixture(base);
        const r = await createReviewFixture(f);
        const sibling = await createReviewFixture({ ...f, a1: f.a2 });
        const id = await r.seed();
        const elsewhere = await sibling.seed();
        const neighbor = await r.seed({ ...reviewAnswers, email: 'neighbor@example.com' });
        expect((await r.moderate(id, 'approve')).status).toBe(200);
        await f.db.execute(
          "alter table audit_logs add constraint fixture_review_publish check (action <> 'review.publish') not valid",
        );
        expect((await r.moderate(id, 'publish')).status).toBe(500);
        const publicPath = `${r.publicRoot}/reviews?key=${r.publishable.token}`;
        expect(await (await f.request(publicPath)).json()).toEqual({ data: [], nextCursor: null });
        await f.db.execute('alter table audit_logs drop constraint fixture_review_publish');
        expect((await r.moderate(id, 'publish')).status).toBe(200);
        expect((await r.moderate(id, 'publish')).status).toBe(200);
        const audits = await f.db.execute<{ changes: unknown }>(
          "select changes from audit_logs where action = 'review.publish'",
        );
        expect(audits.rows).toEqual([{ changes: { status: 'approved' } }]);
        const preErase = await f.request(publicPath);
        expect(await preErase.json()).toMatchObject({ data: [{ id }] });
        const root = `/v1/projects/${f.a1.id}/privacy`;
        const body = { email: reviewAnswers.email.toUpperCase() };
        const result = await f.request(`${root}/subject-export`, body, f.admin.cookie);
        expect(result.status).toBe(200);
        const exported = subjectExportResponseSchema.parse(await result.json());
        expect(exported.modules['reviews']).toMatchObject({
          reviews: [
            {
              id,
              email: reviewAnswers.email,
              privateFields: { reference: reviewAnswers.fields.reference },
            },
          ],
        });
        expect(JSON.stringify(exported)).not.toContain(elsewhere);
        expect(JSON.stringify(exported)).not.toContain(neighbor);
        expect((await f.request(`${root}/subject-delete`, body, f.admin.cookie)).status).toBe(202);
        await eventually(
          async () =>
            (await f.request(`${r.recordRoot}/${id}`, undefined, f.member.cookie)).status === 404,
          10_000,
        );
        const remaining = await f.db.execute<{ id: string }>('select id from reviews order by id');
        expect(remaining.rows.map((row) => row.id)).toEqual([neighbor, elsewhere].toSorted());
        const next = await f.request(publicPath, undefined, undefined, {
          'if-none-match': preErase.headers.get('etag') ?? '',
        });
        expect(next.status).toBe(200);
        expect(await next.json()).toEqual({ data: [], nextCursor: null });
        expect(
          JSON.stringify(
            (await f.db.execute<{ changes: unknown }>('select changes from audit_logs')).rows,
          ),
        ).not.toContain(reviewAnswers.email);
        expect(
          (
            await f.request(
              `/v1/projects/${f.a1.id}`,
              undefined,
              f.owner.cookie,
              undefined,
              'DELETE',
            )
          ).status,
        ).toBe(204);
        const archived = await f.request(
          '/v1/project-erasures',
          {
            projectId: f.a1.id,
            confirm: f.a1.slug,
          },
          f.owner.cookie,
        );
        expect(archived.status).toBe(202);
        await eventually(async () => {
          const records = await f.db.execute<{ id: string }>('select id from reviews order by id');
          return records.rows.length === 1 && records.rows[0]?.id === elsewhere;
        }, 10_000);
      },
      { BACKBRICKS_MODULES: 'reviews' },
      { durableDelivery: true },
    );
  },
  40_000,
);

test.skipIf(!available)(
  'reviews leave public reads as soon as retention expires and workers hard-delete them',
  async () => {
    let shift = 0;
    const clock = { now: () => new Date(Date.now() + shift) };
    await scenario(
      async (base) => {
        const f = await prepareIsolationFixture(base);
        const r = await createReviewFixture(f, 'testimonials', { retentionDays: 7 });
        const forever = await createReviewFixture(f, 'long-lived', { retentionDays: null });
        const id = await r.seed();
        const spam = await forever.seed({
          ...reviewAnswers,
          body: Array.from({ length: 11 }, () => 'https://example.test').join(' '),
        });
        const kept = await forever.seed({ ...reviewAnswers, email: 'kept@example.com' });
        expect((await r.moderate(id, 'approve')).status).toBe(200);
        expect((await r.moderate(id, 'publish')).status).toBe(200);
        const path = `${r.publicRoot}/reviews?key=${r.publishable.token}`;
        const response = await f.request(path);
        expect(await response.json()).toMatchObject({ data: [{ id }] });
        shift = 8 * MILLISECONDS_PER_DAY;
        const due = await f.request(path, undefined, undefined, {
          'if-none-match': response.headers.get('etag') ?? '',
        });
        expect(due.status).toBe(200);
        expect(await due.json()).toEqual({ data: [], nextCursor: null });
        const purge = f.jobs().find(({ name }) => name === PLATFORM_JOBS.retentionPurge);
        if (!purge) throw new Error('Expected platform retention handler.');
        const context = { organizationId: f.organizationId, projectId: f.a1.id };
        await purge.run(context, { runId: crypto.randomUUID() });
        expect(
          (await f.db.execute<{ id: string }>('select id from reviews order by id')).rows.map(
            (row) => row.id,
          ),
        ).toEqual([spam, kept].toSorted());
        shift = 31 * MILLISECONDS_PER_DAY;
        await purge.run(context, { runId: crypto.randomUUID() });
        expect(
          (await f.db.execute<{ id: string }>('select id from reviews order by id')).rows.map(
            (row) => row.id,
          ),
        ).toEqual([kept]);
      },
      { BACKBRICKS_MODULES: 'reviews' },
      { keyClock: clock },
    );
  },
  40_000,
);
