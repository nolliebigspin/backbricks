import { expect, test } from 'bun:test';

import { createWithTenant } from '@backbricks/db';
import { z } from 'zod';

import { eventually } from '../../../scripts/test/eventually.ts';
import { receivedMail, receivedMailCount, TEST_SMTP_URL } from '../../../scripts/test/mailpit.ts';
import { actionLink, available, scenario, type AuthFixture } from '../test/auth-fixture.ts';
import { prepareIsolationFixture } from '../test/isolation/setup.ts';
import { issueKey } from '../test/platform-read-fixture.ts';

const rows = z.object({ rows: z.array(z.record(z.string(), z.unknown())) });
async function mailJobs(f: AuthFixture) {
  return rows.parse(
    await f.db.execute("select state, output from pgboss.job where name = 'core.mail.deliver'"),
  ).rows;
}
const workingMailer = { smtpUrl: TEST_SMTP_URL, from: 'noreply@example.invalid' };
const outageMailer = { smtpUrl: 'smtp://127.0.0.1:1', from: 'noreply@example.invalid' };

test.skipIf(!available)(
  'auth mail is committed atomically, survives SMTP outage/restart and never sends on commit failure',
  async () => {
    await scenario(
      async (f) => {
        const email = `durable-${crypto.randomUUID()}@example.invalid`;
        const result = await f.request('/sign-up/email', {
          email,
          name: 'Fixture',
          password: 'long-password-1234',
        });
        expect(result.status).toBe(200);
        await eventually(async () => (await mailJobs(f)).some((job) => job['state'] === 'retry'));
        expect(await receivedMailCount(email, 'Confirm your email address')).toBe(0);
        expect(JSON.stringify(await mailJobs(f))).not.toContain('ECONNREFUSED');
        await f.capabilities({ mailer: workingMailer, signupPolicy: 'open' });
        await eventually(async () => (await mailJobs(f)).length === 0);
        const mail = await receivedMail(email);
        const link = actionLink(mail.HTML);
        expect((await f.request(`/verify-email${link.search}`)).status).toBe(302);
        expect(f.logs.join('')).not.toContain(email);
        expect(f.logs.join('')).not.toContain(link.searchParams.get('token'));
        await f.db.execute(
          `CREATE FUNCTION fixture_durable_commit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'private-queue-commit-diagnostic'; END $$`,
        );
        await f.db.execute(
          `CREATE CONSTRAINT TRIGGER fixture_durable_commit_failure AFTER INSERT ON "user" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fixture_durable_commit_failure()`,
        );
        const failedEmail = `rolled-back-${crypto.randomUUID()}@example.invalid`;
        expect(
          (
            await f.request('/sign-up/email', {
              email: failedEmail,
              name: 'Fixture',
              password: 'long-password-1234',
            })
          ).status,
        ).toBe(503);
        expect(await mailJobs(f)).toEqual([]);
        expect(await receivedMailCount(failedEmail, 'Confirm your email address')).toBe(0);
        expect(f.logs.join('')).not.toContain('private-queue-commit-diagnostic');
      },
      { SMTP_URL: outageMailer.smtpUrl },
      { durableDelivery: true },
    );
  },
  20_000,
);

test.skipIf(!available)(
  'committed invitations and throttled exposure alerts retry after outage through the restricted delivery channel',
  async () => {
    await scenario(
      async (base) => {
        const f = await prepareIsolationFixture(base);
        await f.capabilities({ mailer: outageMailer, signupPolicy: 'open' });
        const email = `invited-${crypto.randomUUID()}@example.invalid`;
        const invitation = await f.request(
          '/organization/invite-member',
          { organizationId: f.organizationId, email, role: 'member' },
          f.owner.cookie,
        );
        expect(invitation.status).toBe(200);
        const key = await issueKey(f, f.a1.id, {
          kind: 'secret',
          name: 'Never include this label',
          scopes: ['project:write'],
          expiresAt: null,
        });
        const exposed = await Promise.all(
          Array.from({ length: 4 }, () =>
            f.request(
              `/v1/projects/${f.a1.id}`,
              { name: 'Must not change' },
              undefined,
              { authorization: `Bearer ${key.token}`, origin: 'https://foreign.test' },
              'PATCH',
            ),
          ),
        );
        expect(exposed.every((response) => response.status === 403)).toBe(true);
        await f.dispatchOutbox();
        const pending = await createWithTenant(f.db)(
          { organizationId: f.organizationId, projectId: f.a1.id },
          (tx) => tx.repositories.events.pending(100),
        );
        expect(pending).toEqual([]);
        await eventually(async () => (await mailJobs(f)).some((job) => job['state'] === 'retry'));
        expect(await receivedMailCount(email, 'You are invited to Backbricks')).toBe(0);
        await f.capabilities({ mailer: workingMailer, signupPolicy: 'open' });
        await eventually(async () => (await mailJobs(f)).length === 0);
        expect((await receivedMail(email)).HTML).toContain('accept-invitation');
        expect(await receivedMailCount(f.owner.email, 'Rotate an exposed secret key')).toBe(1);
        expect(await receivedMailCount(f.admin.email, 'Rotate an exposed secret key')).toBe(1);
        expect(await receivedMailCount(f.member.email, 'Rotate an exposed secret key')).toBe(0);
        const alert = await receivedMail(f.owner.email, 0, 'Rotate an exposed secret key');
        expect(alert.Text).not.toContain(key.token);
        expect(alert.Text).not.toContain('Never include this label');
        expect(f.logs.join('')).not.toContain(key.token);
        const eventRows = rows.parse(await f.db.execute('select payload from events')).rows;
        expect(JSON.stringify(eventRows)).not.toContain(email);
        expect(JSON.stringify(eventRows)).not.toContain(key.token);
      },
      {},
      { durableDelivery: true },
    );
  },
  25_000,
);
