import { expect, test } from 'bun:test';

import {
  instanceResponseSchema,
  NOTIFICATION_THROTTLE_WINDOW_MS,
  notificationDigestPayloadSchema,
  queueEnvelopeSchema,
} from '@backbricks/core';

import { eventually } from '../../../scripts/test/eventually.ts';
import { receivedMail, receivedMailCount } from '../../../scripts/test/mailpit.ts';
import { available, idResponseSchema, scenario } from '../test/auth-fixture.ts';
import { createFormFixture, createSubmissionFixture, validAnswers } from '../test/forms-fixture.ts';
import { prepareIsolationFixture } from '../test/isolation/setup.ts';

// Runs mid-hour, so the hourly throttle window can't roll over while the test runs.
const offset =
  (((NOTIFICATION_THROTTLE_WINDOW_MS / 2 - (Date.now() % NOTIFICATION_THROTTLE_WINDOW_MS)) %
    NOTIFICATION_THROTTLE_WINDOW_MS) +
    NOTIFICATION_THROTTLE_WINDOW_MS) %
  NOTIFICATION_THROTTLE_WINDOW_MS;
const midHour = { now: () => new Date(Date.now() + offset) };
const entryMails = (to: string) => receivedMailCount(to, 'New');

test.skipIf(!available)(
  'notifications reach Mailpit content-free by default, escape opt-in content and throttle into one digest',
  async () => {
    await scenario(
      async (base) => {
        const f = await prepareIsolationFixture(base);
        const { key } = await createFormFixture(f);
        const instance = instanceResponseSchema.parse(
          await (
            await f.request(`/v1/projects/${f.a1.id}/forms/${key}`, undefined, f.admin.cookie)
          ).json(),
        );
        const rules = `/v1/projects/${f.a1.id}/notification-rules`;
        const createRule = async (body: Record<string, unknown>) => {
          const response = await f.request(
            rules,
            { eventType: 'forms.submission.created', ...body },
            f.admin.cookie,
          );
          expect(response.status).toBe(201);
          return idResponseSchema.parse(await response.json()).id;
        };
        const jobs = async (name: string) =>
          (
            await f.db.execute<{ state: string; data: unknown }>(
              `select state, data from pgboss.job where name = '${name}'`,
            )
          ).rows;
        const submit = async (data: Record<string, unknown> = validAnswers) => {
          const id = await createSubmissionFixture(f, key, data);
          await f.dispatchOutbox();
          return id;
        };
        const secret = 'Private <script>alert(1)</script> note';

        // Default: content-free mail with a dashboard link. A failed attempt is retried, never doubled.
        const ruleId = await createRule({
          instanceId: instance.id,
          recipientUserIds: [f.member.id],
        });
        await f.db.execute(
          "alter table pgboss.job add constraint fixture_mail_failure check (name <> 'core.mail.deliver') not valid",
        );
        const first = await submit({ ...validAnswers, message: secret });
        await eventually(async () =>
          (await jobs('core.notifications.deliver')).some((job) => job.state === 'retry'),
        );
        expect(await entryMails(f.member.email)).toBe(0);
        await f.db.execute('alter table pgboss.job drop constraint fixture_mail_failure');
        await eventually(async () => (await entryMails(f.member.email)) === 1, 15_000);
        const plain = await receivedMail(f.member.email, 0, 'New');
        expect(plain.Subject).toBe('New entry: Contact');
        expect(plain.Text).toContain(`/projects/${f.a1.id}/forms/${key}?entry=${first}`);
        expect(plain.Text).toContain('does not include the entry');
        for (const value of ['Ada', 'Lovelace', 'Private', 'script'])
          expect(`${plain.Text}${plain.HTML}`).not.toContain(value);
        await eventually(async () =>
          (await jobs('core.notifications.deliver')).every((job) => job.state === 'completed'),
        );
        expect(await entryMails(f.member.email)).toBe(1);

        // Spam is never mailed.
        const links = Array.from({ length: 11 }, (_, index) => `https://spam.test/${index}`);
        await submit({ ...validAnswers, message: links.join(' ') });
        await eventually(async () => (await jobs('core.notifications.deliver')).length === 2);
        await eventually(async () =>
          (await jobs('core.notifications.deliver')).every((job) => job.state === 'completed'),
        );
        expect(await entryMails(f.member.email)).toBe(1);

        // Opt-in content arrives as escaped text.
        expect(
          (
            await f.request(
              `${rules}/${ruleId}`,
              { includeContent: true },
              f.admin.cookie,
              undefined,
              'PATCH',
            )
          ).status,
        ).toBe(200);
        await submit({ ...validAnswers, message: secret });
        await eventually(async () => (await entryMails(f.member.email)) === 2, 15_000);
        const withContent = await receivedMail(f.member.email, 0, 'New');
        expect(withContent.HTML).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
        expect(withContent.HTML).not.toContain('<script>');
        expect(withContent.Text).toContain('Ada Lovelace');
        expect(withContent.Text).toContain('Message');
        expect(
          (await f.request(`${rules}/${ruleId}`, undefined, f.admin.cookie, undefined, 'DELETE'))
            .status,
        ).toBe(204);

        // The 11th entry in an hour joins one digest instead of becoming a mail.
        const throttled = await createRule({ recipientUserIds: [f.admin.id] });
        for (let index = 0; index < 11; index++) {
          // oxlint-disable-next-line no-await-in-loop -- Entries arrive one after another.
          await submit();
        }
        await eventually(async () => (await entryMails(f.admin.email)) === 10, 30_000);
        await eventually(async () => (await jobs('core.notifications.digest')).length === 1);
        await eventually(async () =>
          (await jobs('core.notifications.deliver')).every((job) => job.state === 'completed'),
        );
        expect(await entryMails(f.admin.email)).toBe(10);
        const [pending] = await jobs('core.notifications.digest');
        const payload = notificationDigestPayloadSchema.parse(
          queueEnvelopeSchema.parse(pending?.data).payload,
        );
        expect(payload.ruleId).toBe(throttled);
        const digest = f.jobs().find((job) => job.name === 'core.notifications.digest');
        if (!digest) throw new Error('Expected the digest worker');
        const context = { organizationId: f.organizationId, projectId: f.a1.id };
        await digest.run(context, payload);
        await digest.run(context, payload);
        await eventually(async () => (await receivedMailCount(f.admin.email, 'more')) === 1);
        const summary = await receivedMail(f.admin.email, 0, 'more');
        expect(summary.Subject).toMatch(/^1 more entry: /);
        expect(summary.Text).not.toContain('Ada');
        expect(await receivedMailCount(f.admin.email, 'more')).toBe(1);
        expect(f.logs.join('\n')).not.toContain(f.member.email);

        // Without SMTP, deliveries complete without queueing mail (a fresh, unthrottled rule).
        expect(
          (await f.request(`${rules}/${throttled}`, undefined, f.admin.cookie, undefined, 'DELETE'))
            .status,
        ).toBe(204);
        await createRule({ recipientUserIds: [f.member.id] });
        await f.capabilities({ mailer: null, signupPolicy: 'open' });
        const options = await f.request(`${rules}/options`, undefined, f.admin.cookie);
        expect(await options.json()).toMatchObject({ emailAvailable: false });
        const mails = (await jobs('core.mail.deliver')).length;
        await submit();
        await eventually(async () =>
          (await jobs('core.notifications.deliver')).every((job) => job.state === 'completed'),
        );
        expect((await jobs('core.mail.deliver')).length).toBe(mails);
      },
      {},
      { durableDelivery: true, keyClock: midHour },
    );
  },
  90_000,
);
