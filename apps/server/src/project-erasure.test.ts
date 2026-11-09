import { expect, test } from 'bun:test';

import { createIds, PLATFORM_JOBS, projectResponseSchema, systemClock } from '@backbricks/core';

import { available, scenario } from '../test/auth-fixture.ts';
import { createFormFixture, createSubmissionFixture, validAnswers } from '../test/forms-fixture.ts';
import { prepareIsolationFixture } from '../test/isolation/setup.ts';

test.skipIf(!available)(
  'erasing an archived project leaves no personal record or job payload, resumes after failure and keeps a tombstone',
  async () => {
    await scenario(
      async (base) => {
        const f = await prepareIsolationFixture(base);
        const target = { ...f, a1: f.a2 };
        const projectId = f.a2.id;
        const project = projectResponseSchema.parse(
          await (await f.request(`/v1/projects/${projectId}`, undefined, f.owner.cookie)).json(),
        );

        // Personal and configuration data in the project to erase, and a neighbour that must stay.
        const { key } = await createFormFixture(target);
        const template = await createSubmissionFixture(target, key, {
          ...validAnswers,
          email: 'erased-subject@example.com',
        });
        const values = Array.from(
          { length: 150 },
          () => `('${createIds(systemClock).generate('sub')}')`,
        ).join(',');
        const columns = (
          await f.db.execute<{ column_name: string }>(
            "select column_name from information_schema.columns where table_name = 'form_submissions' and column_name <> 'id'",
          )
        ).rows.map((row) => row.column_name);
        await f.db.execute(
          `insert into form_submissions (id, ${columns.join(',')}) select seed.id, ${columns.map((name) => `original.${name}`).join(',')} from (values ${values}) as seed(id) cross join form_submissions original where original.id = '${template}'`,
        );
        const { key: neighbourKey } = await createFormFixture(f);
        const neighbour = await createSubmissionFixture(f, neighbourKey);
        expect(
          (
            await f.request(
              `/v1/projects/${projectId}/notification-rules`,
              { eventType: 'forms.submission.created', recipientUserIds: [f.member.id] },
              f.admin.cookie,
            )
          ).status,
        ).toBe(201);
        expect(
          (
            await f.request(
              `/v1/projects/${projectId}/privacy/subject-delete`,
              { email: 'erased-subject@example.com' },
              f.admin.cookie,
            )
          ).status,
        ).toBe(202);
        await f.dispatchOutbox();

        // Only the owner, only archived projects, only with the slug typed.
        const erase = (confirm: string, cookie = f.owner.cookie) =>
          f.request('/v1/project-erasures', { projectId, confirm }, cookie);
        expect((await erase(project.slug)).status).toBe(409);
        expect(
          (
            await f.request(
              `/v1/projects/${projectId}`,
              undefined,
              f.owner.cookie,
              undefined,
              'DELETE',
            )
          ).status,
        ).toBe(204);
        expect((await erase('wrong')).status).toBe(422);
        expect((await erase(project.slug, f.admin.cookie)).status).toBe(403);
        expect((await erase(project.slug)).status).toBe(202);
        const queued = await f.db.execute<{ data: { archivedProject?: boolean } }>(
          `select data from pgboss.job where name = '${PLATFORM_JOBS.projectErasure}'`,
        );
        expect(queued.rows.map((row) => row.data.archivedProject)).toEqual([true]);

        // Bounded rounds; a failure in the last round rolls back and the retry finishes the job.
        const job = f.jobs().find((candidate) => candidate.name === PLATFORM_JOBS.projectErasure);
        if (!job) throw new Error('Expected the erasure worker');
        const context = {
          organizationId: f.organizationId,
          projectId,
          archivedProject: true as const,
        };
        await job.run(context, {});
        const left = async () =>
          Number(
            (
              await f.db.execute<{ n: string }>(
                `select count(*) as n from form_submissions where project_id = '${projectId}'`,
              )
            ).rows[0]?.n,
          );
        expect(await left()).toBe(51);
        await f.db.execute(
          "alter table audit_logs add constraint fixture_erasure_failure check (action <> 'project.erased') not valid",
        );
        expect(await job.run(context, { round: 2 }).catch(() => 'failed')).toBe('failed');
        await f.db.execute('alter table audit_logs drop constraint fixture_erasure_failure');
        expect(await left()).toBe(51);
        await job.run(context, { round: 2 });
        await job.run(context, {});

        // Nothing project-scoped remains except the tombstone and structural audit history.
        const tables = await f.db.execute<{ table_name: string }>(
          "select table_name from information_schema.columns where table_schema = 'public' and column_name = 'project_id' and table_name <> 'audit_logs'",
        );
        expect(tables.rows.length).toBeGreaterThan(6);
        for (const { table_name: table } of tables.rows) {
          // oxlint-disable-next-line no-await-in-loop -- One count per project-scoped table.
          const rows = await f.db.execute<{ one: number }>(
            `select 1 as one from ${table} where project_id = '${projectId}'`,
          );
          expect([table, rows.rows.length]).toEqual([table, 0]);
        }
        const jobs = await f.db.execute<{ name: string }>(
          `select name from pgboss.job where data->>'projectId' = '${projectId}'`,
        );
        expect(jobs.rows).toEqual([]);
        const tombstone = await f.db.execute<Record<string, unknown>>(
          `select name, slug, allowed_origins, settings, erased_at from projects where id = '${projectId}'`,
        );
        expect(tombstone.rows[0]).toMatchObject({
          name: 'Erased project',
          slug: expect.stringMatching(/^erased-/),
          allowed_origins: [],
          settings: {},
        });
        expect(tombstone.rows[0]?.['erased_at']).not.toBeNull();
        const audit = JSON.stringify(
          (
            await f.db.execute<{ action: string; changes: unknown }>(
              `select action, changes from audit_logs where project_id = '${projectId}' or target_id = '${projectId}'`,
            )
          ).rows,
        );
        for (const personal of [
          project.name,
          project.slug,
          'erased-subject@example.com',
          f.member.email,
        ])
          expect(audit).not.toContain(personal);
        expect(audit).toContain('project.erased');

        // The neighbour is untouched; the erased project stays unreachable and can't be erased again.
        const remaining = await f.db.execute<{ id: string }>('select id from form_submissions');
        expect(remaining.rows.map((row) => row.id)).toEqual([neighbour]);
        expect(
          (await f.request(`/v1/projects/${projectId}`, undefined, f.owner.cookie)).status,
        ).toBe(404);
        expect((await erase(project.slug)).status).toBe(404);
      },
      {},
      { durableDelivery: true, consumeJobs: false },
    );
  },
  60_000,
);
