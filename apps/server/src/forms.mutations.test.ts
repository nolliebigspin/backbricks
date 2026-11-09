import { expect, test } from 'bun:test';

import { createIds, systemClock, instanceResponseSchema } from '@backbricks/core';
import {
  createWithTenant,
  moduleRepositoryFactories,
  selectModuleRepositories,
} from '@backbricks/db';
import { submissionDetailSchema } from '@backbricks/module-forms';

import { available, scenario } from '../test/auth-fixture.ts';
import { createFormFixture, createSubmissionFixture } from '../test/forms-fixture.ts';
import { prepareIsolationFixture } from '../test/isolation/setup.ts';
import { issueKey } from '../test/platform-read-fixture.ts';

test.skipIf(!available)(
  'delete-all is admin-session-only and processes bounded, audited transactions',
  async () => {
    await scenario(
      async (base) => {
        const f = await prepareIsolationFixture(base);
        const { key } = await createFormFixture(f);
        const id = await createSubmissionFixture(f, key);
        const root = `/v1/projects/${f.a1.id}/forms/${key}`;
        const instance = instanceResponseSchema.parse(
          await (await f.request(root, undefined, f.admin.cookie)).json(),
        );
        const context = { organizationId: f.organizationId, projectId: f.a1.id };
        const run = createWithTenant(
          f.db,
          selectModuleRepositories(moduleRepositoryFactories, ['forms']),
        );
        const ids = createIds(systemClock);
        await run(context, async (tx) => {
          const repository = tx.modules.forms;
          if (!repository) throw new Error('Expected scoped forms fixture');
          const row = await repository.get(instance.id, id);
          for (let index = 0; index < 101; index++)
            // oxlint-disable-next-line no-await-in-loop -- Seed enough real rows to prove the worker's batch boundary.
            await repository.insert({ ...row, id: ids.generate('sub'), searchText: 'Fixture' });
        });
        expect(
          (await f.request(`${root}/submissions/delete-all`, { confirm: key }, f.member.cookie))
            .status,
        ).toBe(403);
        expect(
          (await f.request(`${root}/submissions/delete-all`, { confirm: 'wrong' }, f.admin.cookie))
            .status,
        ).toBe(422);
        await f.db.execute(
          "alter table audit_logs add constraint fixture_forms_delete_request check (action <> 'forms.submissions.delete_all_requested') not valid",
        );
        expect(
          (await f.request(`${root}/submissions/delete-all`, { confirm: key }, f.admin.cookie))
            .status,
        ).toBe(500);
        await f.db.execute('alter table audit_logs drop constraint fixture_forms_delete_request');
        expect(
          (await f.request(`${root}/submissions/delete-all`, { confirm: key }, f.admin.cookie))
            .status,
        ).toBe(202);
        const job = f.jobs().find((entry) => entry.name === 'forms.submissions.delete-all');
        if (!job) throw new Error('Expected delete-all job');
        await job.run(context, { instanceId: instance.id, deletedCount: 0 });
        const counts = () => run(context, async (tx) => tx.modules.forms?.counts(instance.id));
        expect((await counts())?.total).toBe(2);
        await f.db.execute(
          "alter table audit_logs add constraint fixture_forms_delete_summary check (action <> 'forms.submissions.deleted_all') not valid",
        );
        const failure = await job
          .run(context, { instanceId: instance.id, deletedCount: 100 })
          .catch((error: unknown) => error);
        expect(failure).toBeInstanceOf(Error);
        await f.db.execute('alter table audit_logs drop constraint fixture_forms_delete_summary');
        expect((await counts())?.total).toBe(2);
        await job.run(context, { instanceId: instance.id, deletedCount: 100 });
        expect((await counts())?.total).toBe(0);
        const audits = await f.db.execute<{ changes: { count: number } }>(
          "select changes from audit_logs where action = 'forms.submissions.deleted_all'",
        );
        expect(audits.rows.map((row) => row.changes.count)).toEqual([102]);
      },
      {},
      { durableDelivery: true, consumeJobs: false },
    );
  },
  30_000,
);

test.skipIf(!available)(
  'entry status, read and spam changes audit atomically; members can delete individual entries',
  async () => {
    await scenario(async (base) => {
      const f = await prepareIsolationFixture(base);
      const { key } = await createFormFixture(f);
      const id = await createSubmissionFixture(f, key);
      const path = `/v1/projects/${f.a1.id}/forms/${key}/submissions/${id}`;
      const change = (body: unknown) => f.request(path, body, f.member.cookie, undefined, 'PATCH');
      const changed = await change({ status: 'done', read: true });
      expect(changed.status).toBe(200);
      const read = async () =>
        submissionDetailSchema.parse(
          await (await f.request(path, undefined, f.member.cookie)).json(),
        );
      expect(await read()).toMatchObject({ status: 'done', read: true });
      expect((await change({ data: { email: 'replace@example.test' } })).status).toBe(422);
      await f.db.execute(
        "alter table audit_logs add constraint fixture_forms_update_audit check (action <> 'forms.submission.updated') not valid",
      );
      expect((await change({ read: false })).status).toBe(500);
      await f.db.execute('alter table audit_logs drop constraint fixture_forms_update_audit');
      expect((await read()).read).toBe(true);
      expect((await change({ spamVerdict: 'spam' })).status).toBe(200);
      const spam = await read();
      expect(spam.spamVerdict).toBe('spam');
      expect(new Date(spam.expiresAt!).getTime()).toBeLessThanOrEqual(
        f.now().getTime() + 30 * 86_400_000,
      );
      await f.db.execute(
        "alter table audit_logs add constraint fixture_forms_delete_audit check (action <> 'forms.submission.deleted') not valid",
      );
      expect((await f.request(path, undefined, f.member.cookie, undefined, 'DELETE')).status).toBe(
        500,
      );
      await f.db.execute('alter table audit_logs drop constraint fixture_forms_delete_audit');
      expect((await f.request(path, undefined, f.member.cookie)).status).toBe(200);
      expect((await f.request(path, undefined, f.member.cookie, undefined, 'DELETE')).status).toBe(
        204,
      );
      expect((await f.request(path, undefined, f.member.cookie)).status).toBe(404);
      const audit = await f.db.execute<{ changes: unknown }>(
        "select changes from audit_logs where action like 'forms.%'",
      );
      expect(JSON.stringify(audit.rows)).not.toContain('ada@example.com');
    });
  },
  30_000,
);

test.skipIf(!available)(
  'bulk metadata changes and deletion are bounded, scoped and all-or-nothing',
  async () => {
    await scenario(async (base) => {
      const f = await prepareIsolationFixture(base);
      const { key } = await createFormFixture(f);
      const ids = [await createSubmissionFixture(f, key), await createSubmissionFixture(f, key)];
      const other = await createFormFixture(f, 'other');
      const foreign = await createSubmissionFixture(f, other.key);
      const root = `/v1/projects/${f.a1.id}/forms/${key}/submissions`;
      const bulk = (body: unknown, cookie = f.member.cookie) =>
        f.request(`${root}/bulk`, body, cookie);
      expect((await bulk({ ids, action: 'read' })).status).toBe(200);
      expect((await bulk({ ids: [ids[0], foreign], action: 'done' })).status).toBe(404);
      const read = async (id: string) =>
        submissionDetailSchema.parse(
          await (await f.request(`${root}/${id}`, undefined, f.member.cookie)).json(),
        );
      expect(await read(ids[0]!)).toMatchObject({ read: true, status: 'open' });
      await f.db.execute(
        "alter table audit_logs add constraint fixture_forms_bulk_audit check (action <> 'forms.submissions.bulk_updated') not valid",
      );
      expect((await bulk({ ids, action: 'done' })).status).toBe(500);
      await f.db.execute('alter table audit_logs drop constraint fixture_forms_bulk_audit');
      expect((await read(ids[0]!)).status).toBe('open');
      expect((await bulk({ ids: [ids[0], ids[0]], action: 'read' })).status).toBe(422);
      expect(
        (await bulk({ ids: Array.from({ length: 101 }, (_, i) => `sub_${i}`), action: 'read' }))
          .status,
      ).toBe(422);
      expect((await f.request(`${root}/bulk-delete`, { ids }, f.member.cookie)).status).toBe(403);
      const reader = await issueKey(f, f.a1.id, {
        kind: 'secret',
        name: 'Read only',
        scopes: ['data:read'],
        expiresAt: null,
      });
      expect(
        (
          await f.request(`${root}/bulk-delete`, { ids }, undefined, {
            authorization: `Bearer ${reader.token}`,
          })
        ).status,
      ).toBe(403);
      expect(
        (await f.request(`${root}/bulk-delete`, { ids: [ids[0], foreign] }, f.admin.cookie)).status,
      ).toBe(404);
      await f.db.execute(
        "alter table audit_logs add constraint fixture_forms_bulk_delete_audit check (action <> 'forms.submissions.bulk_deleted') not valid",
      );
      expect((await f.request(`${root}/bulk-delete`, { ids }, f.admin.cookie)).status).toBe(500);
      await f.db.execute('alter table audit_logs drop constraint fixture_forms_bulk_delete_audit');
      expect((await f.request(`${root}/${ids[0]}`, undefined, f.member.cookie)).status).toBe(200);
      expect((await f.request(`${root}/bulk-delete`, { ids }, f.admin.cookie)).status).toBe(200);
      expect((await f.request(`${root}/${ids[0]}`, undefined, f.member.cookie)).status).toBe(404);
      expect(
        (
          await f.request(
            `/v1/projects/${f.a1.id}/forms/other/submissions/${foreign}`,
            undefined,
            f.member.cookie,
          )
        ).status,
      ).toBe(200);
    });
  },
  30_000,
);
