import { expect, test } from 'bun:test';

import { subjectExportResponseSchema } from '@backbricks/core';
import { z } from 'zod';

import { eventually } from '../../../scripts/test/eventually.ts';
import { available, scenario } from '../test/auth-fixture.ts';
import { createFormFixture, createSubmissionFixture, validAnswers } from '../test/forms-fixture.ts';
import { prepareIsolationFixture } from '../test/isolation/setup.ts';

const entriesSchema = z.object({ entries: z.array(z.object({ id: z.string() })) });

test.skipIf(!available)(
  'subject export and erasure stay within the project and never record the email',
  async () => {
    await scenario(
      async (base) => {
        const f = await prepareIsolationFixture(base);
        const sibling = { ...f, a1: f.a2 };
        const { key } = await createFormFixture(f);
        const { key: siblingKey } = await createFormFixture(sibling);
        const ada = [
          await createSubmissionFixture(f, key),
          await createSubmissionFixture(f, key, { ...validAnswers, message: 'Second' }),
        ];
        const bob = await createSubmissionFixture(f, key, {
          ...validAnswers,
          email: 'bob@example.com',
        });
        const elsewhere = await createSubmissionFixture(sibling, siblingKey);
        const root = `/v1/projects/${f.a1.id}/privacy`;
        const body = { email: 'ADA@example.com' };
        const remaining = async () =>
          (
            await f.db.execute<{ id: string }>('select id from form_submissions order by id')
          ).rows.map((row) => row.id);
        const fail = (action: string) =>
          f.db.execute(
            `alter table audit_logs add constraint fixture_privacy_failure check (action <> '${action}') not valid`,
          );
        const restore = () =>
          f.db.execute('alter table audit_logs drop constraint fixture_privacy_failure');

        // Access: normalized email, this project only, nothing about other subjects.
        const exported = await f.request(`${root}/subject-export`, body, f.admin.cookie);
        expect(exported.status).toBe(200);
        const result = subjectExportResponseSchema.parse(await exported.json());
        const forms = entriesSchema.parse(result.modules['forms']);
        expect(forms.entries.map((entry) => entry.id).toSorted()).toEqual(ada.toSorted());
        expect(JSON.stringify(result)).not.toContain('bob@example.com');
        expect((await f.request(`${root}/subject-export`, body, f.member.cookie)).status).toBe(403);
        await fail('privacy.subject_exported');
        expect((await f.request(`${root}/subject-export`, body, f.admin.cookie)).status).toBe(500);
        await restore();

        // A failed audit leaves no erasure job behind.
        await fail('privacy.subject_erasure_requested');
        expect((await f.request(`${root}/subject-delete`, body, f.admin.cookie)).status).toBe(500);
        await restore();
        expect(
          (
            await f.db.execute<{ id: string }>(
              "select id from pgboss.job where name = 'core.privacy.erase'",
            )
          ).rows,
        ).toHaveLength(0);

        // Erasure runs as a worker job and removes only this subject in this project.
        const erased = await f.request(`${root}/subject-delete`, body, f.admin.cookie);
        expect(erased.status).toBe(202);
        expect(await erased.json()).toEqual({ status: 'queued' });
        await eventually(
          async () => (await remaining()).join() === [bob, elsewhere].toSorted().join(),
          10_000,
        );

        const audit = await f.db.execute<{ action: string; changes: unknown }>(
          "select action, changes from audit_logs where action like 'privacy.%' order by created_at",
        );
        expect(audit.rows.map((row) => row.action)).toEqual([
          'privacy.subject_exported',
          'privacy.subject_erasure_requested',
          'privacy.module_subject_erased',
        ]);
        expect(audit.rows.at(-1)?.changes).toEqual({ count: 2 });
        const recorded = JSON.stringify([
          audit.rows,
          (await f.db.execute<{ payload: unknown }>('select payload from events')).rows,
          f.logs,
        ]).toLowerCase();
        expect(recorded).not.toContain('ada@example.com');
      },
      {},
      { durableDelivery: true },
    );
  },
  60_000,
);
