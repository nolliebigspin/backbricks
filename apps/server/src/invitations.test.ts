import { expect, test } from 'bun:test';

import { authSchema, createWithTenant } from '@backbricks/db';
import { z } from '@hono/zod-openapi';

import {
  available,
  scenario,
  createVerifiedUser,
  cookies,
  idResponseSchema,
} from '../test/auth-fixture.ts';

test.skipIf(!available)(
  'owner-only fallback invites a new account with matching, live, single-use proof',
  async () => {
    await scenario(async (fixture) => {
      const { request, db } = fixture;
      const owner = await createVerifiedUser(fixture);
      const organizationId = idResponseSchema.parse(
        await (
          await request('/organization/create', { name: 'Invites', slug: 'invites' }, owner.cookie)
        ).json(),
      ).id;
      await fixture.capabilities({ mailer: null, signupPolicy: 'invite_only' });
      const email = `invited-${crypto.randomUUID()}@example.invalid`;
      const invitationInput = { organizationId, email, role: 'member' };
      expect((await request('/organization/invite-member', invitationInput)).status).toBe(401);
      const response = await request('/organization/invite-member', invitationInput, owner.cookie);
      expect(response.status).toBe(200);
      const invitation = idResponseSchema
        .extend({ invitationUrl: z.url() })
        .parse(await response.json());
      expect(new URL(invitation.invitationUrl).searchParams.get('invitationId')).toBe(
        invitation.id,
      );
      const signup = {
        invitationId: invitation.id,
        email,
        name: 'Invited person',
        password: 'long-password-1234',
      };
      expect(
        (await request('/sign-up/email', { email, name: signup.name, password: signup.password }))
          .status,
      ).toBe(403);
      expect(
        (await request('/sign-up/email', { ...signup, email: 'wrong@example.invalid' })).status,
      ).toBe(404);
      expect((await request('/sign-up/email', { ...signup, invitationId: 'invalid' })).status).toBe(
        404,
      );
      const joined = await request('/sign-up/email', signup);
      expect(joined.status).toBe(200);
      expect(joined.headers.getSetCookie().join('')).toContain('HttpOnly');
      expect(await joined.clone().json()).not.toHaveProperty('token');
      const user = z
        .object({ user: z.object({ id: z.string(), emailVerified: z.boolean() }) })
        .parse(await joined.json()).user;
      expect(user.emailVerified).toBe(true);
      const member = (await db.select().from(authSchema.member)).find(
        (entry) => entry.userId === user.id,
      );
      expect(member).toMatchObject({ organizationId, role: 'member' });
      const nextInvite = {
        organizationId,
        email: 'another-person@example.invalid',
        role: 'member',
      };
      expect(
        (await request('/organization/invite-member', nextInvite, cookies(joined))).status,
      ).toBe(403);
      expect(
        (
          await request(
            '/organization/update-member-role',
            { organizationId, memberId: member!.id, role: 'admin' },
            owner.cookie,
          )
        ).status,
      ).toBe(200);
      const adminInvite = await request('/organization/invite-member', nextInvite, cookies(joined));
      expect(adminInvite.status).toBe(200);
      expect(await adminInvite.json()).toHaveProperty('invitationUrl');
      expect(
        (
          await request(
            `/organization/get-organization?organizationId=${organizationId}`,
            undefined,
            cookies(joined),
          )
        ).status,
      ).toBe(200);
      expect((await request('/sign-up/email', signup)).status).toBe(404);
      expect(
        (await db.select().from(authSchema.invitation)).find((entry) => entry.id === invitation.id)
          ?.status,
      ).toBe('accepted');
      const audit = await createWithTenant(db)({ organizationId }, ({ repositories }) =>
        repositories.audit.list({ limit: 100 }),
      );
      expect(audit.find((entry) => entry.action === 'membership.created')?.actorId).toBe(user.id);
      expect(JSON.stringify(audit)).not.toContain(invitation.id);
      expect(fixture.logs.join('')).not.toContain(invitation.id);
      expect(fixture.logs.join('')).not.toContain(email);
    });
  },
  15_000,
);

test.skipIf(!available)(
  'an invitation cannot replace an existing account password',
  async () => {
    await scenario(async (fixture) => {
      const { request, db } = fixture;
      const owner = await createVerifiedUser(fixture);
      const existing = await createVerifiedUser(fixture);
      const organizationId = idResponseSchema.parse(
        await (
          await request(
            '/organization/create',
            { name: 'Existing users', slug: 'existing-users' },
            owner.cookie,
          )
        ).json(),
      ).id;
      await fixture.capabilities({ mailer: null, signupPolicy: 'invite_only' });
      const invitationId = idResponseSchema.parse(
        await (
          await request(
            '/organization/invite-member',
            { organizationId, email: existing.email, role: 'member' },
            owner.cookie,
          )
        ).json(),
      ).id;
      const attempted = await request('/sign-up/email', {
        invitationId,
        email: existing.email,
        name: 'Impersonation',
        password: 'a-different-password-1234',
      });
      expect(attempted.status).toBeGreaterThanOrEqual(400);
      expect(attempted.headers.getSetCookie()).toHaveLength(0);
      expect(await db.select().from(authSchema.user)).toHaveLength(2);
      expect((await db.select().from(authSchema.invitation))[0]?.status).toBe('pending');
      expect(
        (
          await request('/sign-in/email', {
            email: existing.email,
            password: 'a-long-test-password-1234',
          })
        ).status,
      ).toBe(200);
      expect(
        (await request('/organization/accept-invitation', { invitationId }, existing.cookie))
          .status,
      ).toBe(200);
    });
  },
  15_000,
);

test.skipIf(!available)(
  'invite-bound signup rolls back identity/session on audit failure and rejects expired/canceled proof',
  async () => {
    await scenario(async (fixture) => {
      const { request, db } = fixture;
      const owner = await createVerifiedUser(fixture);
      const organizationId = idResponseSchema.parse(
        await (
          await request(
            '/organization/create',
            { name: 'Atomic invites', slug: 'atomic-invites' },
            owner.cookie,
          )
        ).json(),
      ).id;
      await fixture.capabilities({ mailer: null, signupPolicy: 'invite_only' });
      const email = `atomic-invite-${crypto.randomUUID()}@example.invalid`;
      const invitationId = idResponseSchema.parse(
        await (
          await request(
            '/organization/invite-member',
            { organizationId, email, role: 'member' },
            owner.cookie,
          )
        ).json(),
      ).id;
      const signup = { invitationId, email, name: 'Fixture', password: 'long-password-1234' };
      await db.execute(
        "ALTER TABLE audit_logs ADD CONSTRAINT fixture_audit_failure CHECK (action <> 'membership.created')",
      );
      const failure = await request('/sign-up/email', signup);
      expect(failure.status).toBe(503);
      expect(failure.headers.getSetCookie()).toHaveLength(0);
      expect(await db.select().from(authSchema.user)).toHaveLength(1);
      expect(await db.select().from(authSchema.session)).toHaveLength(1);
      expect((await db.select().from(authSchema.invitation))[0]?.status).toBe('pending');
      await db.execute('ALTER TABLE audit_logs DROP CONSTRAINT fixture_audit_failure');
      await db.update(authSchema.invitation).set({ expiresAt: new Date('2000-01-01T00:00:00Z') });
      expect((await request('/sign-up/email', signup)).status).toBe(404);
      expect(
        (await request('/organization/cancel-invitation', { invitationId }, owner.cookie)).status,
      ).toBe(200);
      expect((await request('/sign-up/email', signup)).status).toBe(404);
      expect(await db.select().from(authSchema.user)).toHaveLength(1);
    });
  },
  15_000,
);
