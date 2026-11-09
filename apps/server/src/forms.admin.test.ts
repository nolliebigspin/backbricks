import { expect, test } from 'bun:test';

import { submissionListSchema, submissionDetailSchema } from '@backbricks/module-forms';

import { available, scenario } from '../test/auth-fixture.ts';
import { createFormFixture, createSubmissionFixture, validAnswers } from '../test/forms-fixture.ts';
import { prepareIsolationFixture } from '../test/isolation/setup.ts';

test.skipIf(!available)(
  'members read paged form entries and their original field definitions after configuration changes',
  async () => {
    await scenario(async (base) => {
      const f = await prepareIsolationFixture(base);
      const { key } = await createFormFixture(f);
      const first = await createSubmissionFixture(f, key);
      await createSubmissionFixture(f, key, {
        ...validAnswers,
        name: 'Grace',
        message: 'A different inquiry',
      });
      const root = `/v1/projects/${f.a1.id}/forms/${key}`;
      const list = await f.request(
        `${root}/submissions?limit=1&q=Inquiry`,
        undefined,
        f.member.cookie,
      );
      expect(list.status).toBe(200);
      const page = submissionListSchema.parse(await list.json());
      expect(page.data).toHaveLength(1);
      expect(page.data[0]!.data).toEqual({ name: 'Grace', email: 'ada@example.com' });
      expect(page.data[0]).not.toHaveProperty('source');
      expect(page.nextCursor).toBeNull();
      const firstPage = submissionListSchema.parse(
        await (
          await f.request(
            `${root}/submissions?limit=1&read=false&test=false`,
            undefined,
            f.member.cookie,
          )
        ).json(),
      );
      expect(firstPage.nextCursor).not.toBeNull();
      const nextPage = submissionListSchema.parse(
        await (
          await f.request(
            `${root}/submissions?limit=1&cursor=${firstPage.nextCursor}`,
            undefined,
            f.member.cookie,
          )
        ).json(),
      );
      expect(nextPage.data).toHaveLength(1);
      expect(nextPage.data[0]?.id).not.toBe(firstPage.data[0]?.id);
      expect(nextPage.nextCursor).toBeNull();
      const read = submissionListSchema.parse(
        await (await f.request(`${root}/submissions?read=true`, undefined, f.member.cookie)).json(),
      );
      expect(read.data).toHaveLength(0);
      const filtered = submissionListSchema.parse(
        await (
          await f.request(
            `${root}/submissions?status=open&read=false&test=false&q=Inquiry&from=2020-01-01T00:00:00Z&to=2099-01-01T00:00:00Z`,
            undefined,
            f.member.cookie,
          )
        ).json(),
      );
      expect(filtered.data).toHaveLength(1);
      expect(
        (
          await f.request(
            `${root}/submissions?from=2099-01-01T00:00:00Z&to=2020-01-01T00:00:00Z`,
            undefined,
            f.member.cookie,
          )
        ).status,
      ).toBe(422);
      const summary = await f.request(`${root}/summary`, undefined, f.member.cookie);
      expect(await summary.json()).toEqual({ total: 2, unread: 2, spam: 0 });
      for (const [configVersion, fields] of [
        [1, [{ key: 'name', type: 'text', label: 'New label' }]],
        [2, [{ key: 'name', type: 'text', label: 'Third label' }]],
      ] as const) {
        // oxlint-disable-next-line no-await-in-loop -- Configuration versions deliberately advance in order.
        const updated = await f.request(
          root,
          { configVersion, config: { fields } },
          f.admin.cookie,
          undefined,
          'PATCH',
        );
        expect(updated.status).toBe(200);
      }
      const detail = await f.request(`${root}/submissions/${first}`, undefined, f.member.cookie);
      expect(detail.status).toBe(200);
      const body = submissionDetailSchema.parse(await detail.json());
      expect(body.configVersion).toBe(1);
      expect(body.fields.find((field) => field.key === 'name')?.label).toBe('Name');
      expect(body.additionalData['email']).toBe('ada@example.com');
      expect(body.read).toBe(false);
      expect(
        (await f.request(`${root}/submissions?limit=101`, undefined, f.member.cookie)).status,
      ).toBe(422);
    });
  },
  30_000,
);
