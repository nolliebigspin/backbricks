import { expect, test } from 'bun:test';

import { instanceResponseSchema } from '@backbricks/core';

import { available, idResponseSchema, scenario } from '../test/auth-fixture.ts';
import { createFormFixture } from '../test/forms-fixture.ts';
import { prepareIsolationFixture } from '../test/isolation/setup.ts';

test.skipIf(!available)(
  'notification rules target verified members and mutate with content-free audit in the caller transaction',
  async () => {
    await scenario(async (base) => {
      const f = await prepareIsolationFixture(base);
      const { key } = await createFormFixture(f);
      const instance = instanceResponseSchema.parse(
        await (
          await f.request(`/v1/projects/${f.a1.id}/forms/${key}`, undefined, f.admin.cookie)
        ).json(),
      );
      const path = `/v1/projects/${f.a1.id}/notification-rules`;
      const payload = {
        eventType: 'forms.submission.created',
        instanceId: instance.id,
        recipientUserIds: [f.member.id],
      };
      await f.db.execute(
        "alter table audit_logs add constraint fixture_notification_failure check (action <> 'notification.rule.created') not valid",
      );
      expect((await f.request(path, payload, f.admin.cookie)).status).toBe(500);
      await f.db.execute('alter table audit_logs drop constraint fixture_notification_failure');
      expect(await (await f.request(path, undefined, f.admin.cookie)).json()).toMatchObject({
        data: [],
      });
      await f.db.execute(
        `update "user" set email_verified = false where id = '${f.member.id.replaceAll("'", "''")}'`,
      );
      expect((await f.request(path, payload, f.admin.cookie)).status).toBe(422);
      await f.db.execute(
        `update "user" set email_verified = true where id = '${f.member.id.replaceAll("'", "''")}'`,
      );
      const foreign = await createFormFixture(
        { ...f, a1: f.b1, admin: f.other, owner: f.other },
        'foreign',
      );
      const foreignInstance = instanceResponseSchema.parse(
        await (
          await f.request(`/v1/projects/${f.b1.id}/forms/${foreign.key}`, undefined, f.other.cookie)
        ).json(),
      );
      expect(
        (await f.request(path, { ...payload, instanceId: foreignInstance.id }, f.admin.cookie))
          .status,
      ).toBe(404);
      const created = await f.request(path, payload, f.admin.cookie);
      expect(created.status).toBe(201);
      const { id } = idResponseSchema.parse(await created.json());
      expect((await f.request(path, payload, f.member.cookie)).status).toBe(403);
      expect(
        (await f.request(path, { ...payload, recipientUserIds: [f.other.id] }, f.admin.cookie))
          .status,
      ).toBe(422);
      expect(
        (await f.request(path, { ...payload, eventType: 'uploads.file.created' }, f.admin.cookie))
          .status,
      ).toBe(422);
      const options = await f.request(`${path}/options`, undefined, f.admin.cookie);
      expect(options.status).toBe(200);
      const choices = await options.text();
      expect(choices).toContain(f.member.email);
      expect(choices).not.toContain(f.other.email);
      await f.db.execute(
        "alter table audit_logs add constraint fixture_notification_failure check (action <> 'notification.rule.updated') not valid",
      );
      expect(
        (
          await f.request(
            `${path}/${id}`,
            { includeContent: true },
            f.admin.cookie,
            undefined,
            'PATCH',
          )
        ).status,
      ).toBe(500);
      await f.db.execute('alter table audit_logs drop constraint fixture_notification_failure');
      expect(await (await f.request(path, undefined, f.admin.cookie)).json()).toMatchObject({
        data: [{ id, includeContent: false, recipientUserIds: [f.member.id] }],
      });
      expect(
        (
          await f.request(
            `${path}/${id}`,
            { includeContent: true },
            f.admin.cookie,
            undefined,
            'PATCH',
          )
        ).status,
      ).toBe(200);
      await f.db.execute(
        "alter table audit_logs add constraint fixture_notification_failure check (action <> 'membership.removed') not valid",
      );
      expect(
        (
          await f.request(
            '/organization/remove-member',
            { organizationId: f.organizationId, memberIdOrEmail: f.memberId(f.member.id) },
            f.owner.cookie,
          )
        ).status,
      ).toBe(503);
      await f.db.execute('alter table audit_logs drop constraint fixture_notification_failure');
      expect(await (await f.request(path, undefined, f.admin.cookie)).json()).toMatchObject({
        data: [{ id, enabled: true, recipientUserIds: [f.member.id] }],
      });
      expect((await f.request(`/v1/projects/${f.a1.id}`, undefined, f.member.cookie)).status).toBe(
        200,
      );
      expect(
        (
          await f.request(
            '/organization/remove-member',
            { organizationId: f.organizationId, memberIdOrEmail: f.memberId(f.member.id) },
            f.owner.cookie,
          )
        ).status,
      ).toBe(200);
      expect(await (await f.request(path, undefined, f.admin.cookie)).json()).toMatchObject({
        data: [{ id, enabled: false, recipientUserIds: [] }],
      });
      expect(
        (await f.request(`${path}/${id}`, { enabled: true }, f.admin.cookie, undefined, 'PATCH'))
          .status,
      ).toBe(422);
      const audit = await f.db.execute<{ changes: unknown }>(
        "select changes from audit_logs where action like 'notification.%'",
      );
      expect(JSON.stringify(audit.rows)).not.toContain(f.member.email);
      const events = await f.db.execute<{ payload: unknown }>(
        "select payload from events where type like 'notification.%'",
      );
      expect(JSON.stringify(events.rows)).not.toContain(f.member.email);
      expect(f.logs.join('\n')).not.toContain(f.member.email);
      await f.db.execute(
        "alter table audit_logs add constraint fixture_notification_failure check (action <> 'notification.rule.deleted') not valid",
      );
      expect(
        (await f.request(`${path}/${id}`, undefined, f.admin.cookie, undefined, 'DELETE')).status,
      ).toBe(500);
      await f.db.execute('alter table audit_logs drop constraint fixture_notification_failure');
      expect(await (await f.request(path, undefined, f.admin.cookie)).json()).toMatchObject({
        data: [{ id }],
      });
      expect(
        (await f.request(`${path}/${id}`, undefined, f.admin.cookie, undefined, 'DELETE')).status,
      ).toBe(204);
    });
  },
  30_000,
);
