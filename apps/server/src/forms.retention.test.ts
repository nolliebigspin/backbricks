import { expect, test } from 'bun:test';

import { createIds, instanceResponseSchema, PLATFORM_JOBS } from '@backbricks/core';
import { z } from 'zod';

import { available, scenario } from '../test/auth-fixture.ts';
import { createFormFixture, createSubmissionFixture, validAnswers } from '../test/forms-fixture.ts';
import { prepareIsolationFixture } from '../test/isolation/setup.ts';

const DAY = 86_400_000;
const countSchema = z.object({ count: z.number() });
let shift = 0;
const clock = { now: () => new Date(Date.now() + shift) };

test.skipIf(!available)(
  'retention purges expired entries and spam on schedule, in bounded rounds, and leaves the rest',
  async () => {
    shift = 0;
    await scenario(
      async (base) => {
        const f = await prepareIsolationFixture(base);
        const { key } = await createFormFixture(f);
        const { key: forever } = await createFormFixture(f, 'forever', { retentionDays: null });
        const context = { organizationId: f.organizationId, projectId: f.a1.id };
        const purge = f.jobs().find((job) => job.name === PLATFORM_JOBS.retentionPurge);
        if (!purge) throw new Error('Expected the retention worker');
        const runId = crypto.randomUUID();
        const remaining = async () =>
          (
            await f.db.execute<{ id: string }>('select id from form_submissions order by id')
          ).rows.map((row) => row.id);
        const purgeAudits = async () =>
          (
            await f.db.execute<{ changes: unknown }>(
              "select changes from audit_logs where action = 'retention.purged' order by created_at",
            )
          ).rows.map((row) => row.changes);

        const kept = await createSubmissionFixture(f, key);
        const links = Array.from({ length: 11 }, (_, index) => `https://spam.test/${index}`);
        const spam = await createSubmissionFixture(f, key, {
          ...validAnswers,
          message: links.join(' '),
        });
        const unlimited = await createSubmissionFixture(f, forever);
        const unlimitedSpam = await createSubmissionFixture(f, forever, {
          ...validAnswers,
          message: links.join(' '),
        });

        // Nothing is due yet.
        await purge.run(context, { runId });
        expect(await remaining()).toHaveLength(4);
        expect(await purgeAudits()).toEqual([]);

        // After 31 days spam is gone, even with unlimited retention; everything else stays.
        shift = 31 * DAY;
        await purge.run(context, { runId });
        expect(await remaining()).toEqual([kept, unlimited].toSorted());
        expect(await purgeAudits()).toEqual([{ count: 2 }]);
        expect(JSON.stringify(await purgeAudits())).not.toContain(spam);
        expect(JSON.stringify(await purgeAudits())).not.toContain(unlimitedSpam);

        // Shortening retention recomputes expiry in the config transaction; archived forms keep purging.
        const path = `/v1/projects/${f.a1.id}/forms/${key}`;
        const instance = instanceResponseSchema.parse(
          await (await f.request(path, undefined, f.admin.cookie)).json(),
        );
        const shortened = await f.request(
          path,
          {
            configVersion: instance.configVersion,
            config: {
              ...z.record(z.string(), z.unknown()).parse(instance.config),
              retentionDays: 7,
            },
          },
          f.admin.cookie,
          undefined,
          'PATCH',
        );
        expect(shortened.status).toBe(200);
        const expiry = await f.db.execute<{ days: number }>(
          `select (extract(epoch from expires_at - created_at) / 86400)::int as days from form_submissions where id = '${kept}'`,
        );
        expect(expiry.rows).toEqual([{ days: 7 }]);
        expect(
          (
            await f.request(
              `${path}?configVersion=${instance.configVersion + 1}`,
              undefined,
              f.admin.cookie,
              undefined,
              'DELETE',
            )
          ).status,
        ).toBe(204);
        await purge.run(context, { runId });
        expect(await remaining()).toEqual([unlimited]);

        // Bulk backlog: two workers never collide, and a full batch queues the next round.
        const { key: bulk } = await createFormFixture(f, 'bulk', { retentionDays: 7 });
        const template = await createSubmissionFixture(f, bulk);
        // Copies of a real validated row with generated IDs (as in forms.export.test.ts).
        const ids = createIds(clock);
        const values = Array.from({ length: 249 }, () => `('${ids.generate('sub')}')`).join(',');
        const columns = (
          await f.db.execute<{ column_name: string }>(
            "select column_name from information_schema.columns where table_name = 'form_submissions' and column_name <> 'id'",
          )
        ).rows.map((row) => row.column_name);
        await f.db.execute(
          `insert into form_submissions (id, ${columns.join(',')}) select seed.id, ${columns.map((name) => `original.${name}`).join(',')} from (values ${values}) as seed(id) cross join form_submissions original where original.id = '${template}'`,
        );
        shift = 40 * DAY;
        await Promise.all([
          purge.run(context, { runId, round: 2 }),
          purge.run(context, { runId, round: 3 }),
        ]);
        expect(await remaining()).toHaveLength(51);
        const queued = await f.db.execute<{ data: { payload: unknown } }>(
          `select data from pgboss.job where name = '${PLATFORM_JOBS.retentionPurge}'`,
        );
        expect(queued.rows.map((job) => job.data.payload)).toEqual(
          expect.arrayContaining([
            { runId, round: 3 },
            { runId, round: 4 },
          ]),
        );
        await purge.run(context, { runId, round: 4 });
        expect(await remaining()).toEqual([unlimited]);
        expect(
          (await purgeAudits()).reduce<number>((sum, row) => sum + countSchema.parse(row).count, 0),
        ).toBe(2 + 1 + 250);
      },
      {},
      { durableDelivery: true, consumeJobs: false, keyClock: clock },
    );
  },
  60_000,
);
