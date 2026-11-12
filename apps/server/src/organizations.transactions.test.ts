import { expect, test } from 'bun:test';

import { authSchema, createWithTenant } from '@backbricks/db';

import { receivedMail } from '../../../scripts/test/mailpit.ts';
import { available, scenario, createVerifiedUser, idResponseSchema } from '../test/auth-fixture.ts';

test.skipIf(!available)(
  'audit failures roll back organization, invitation, acceptance and membership mutations',
  async () => {
    await scenario(async (fixture) => {
      const { db, request } = fixture;
      const owner = await createVerifiedUser(fixture);
      const invited = await createVerifiedUser(fixture);
      const organizationInput = { name: 'Rollback team', slug: 'rollback-team' };
      await db.execute(
        "ALTER TABLE audit_logs ADD CONSTRAINT fixture_audit_failure CHECK (action <> 'organization.created')",
      );
      expect((await request('/organization/create', organizationInput, owner.cookie)).status).toBe(
        503,
      );
      expect(await db.select().from(authSchema.organization)).toHaveLength(0);
      expect(await db.select().from(authSchema.member)).toHaveLength(0);
      await db.execute('ALTER TABLE audit_logs DROP CONSTRAINT fixture_audit_failure');
      const organizationId = idResponseSchema.parse(
        await (await request('/organization/create', organizationInput, owner.cookie)).json(),
      ).id;
      const inviteInput = { organizationId, email: invited.email, role: 'member' };
      await db.execute(
        "ALTER TABLE audit_logs ADD CONSTRAINT fixture_audit_failure CHECK (action <> 'invitation.created')",
      );
      expect((await request('/organization/invite-member', inviteInput, owner.cookie)).status).toBe(
        503,
      );
      expect(await db.select().from(authSchema.invitation)).toHaveLength(0);
      expect(
        await receivedMail(invited.email, 0, 'invited').catch((error: unknown) => error),
      ).toBeInstanceOf(Error);
      await db.execute('ALTER TABLE audit_logs DROP CONSTRAINT fixture_audit_failure');
      const invitationId = idResponseSchema.parse(
        await (await request('/organization/invite-member', inviteInput, owner.cookie)).json(),
      ).id;
      await db.execute(
        "ALTER TABLE audit_logs ADD CONSTRAINT fixture_audit_failure CHECK (action <> 'membership.created')",
      );
      expect(
        (await request('/organization/accept-invitation', { invitationId }, invited.cookie)).status,
      ).toBe(503);
      expect((await db.select().from(authSchema.invitation))[0]?.status).toBe('pending');
      expect(await db.select().from(authSchema.member)).toHaveLength(1);
      await db.execute('ALTER TABLE audit_logs DROP CONSTRAINT fixture_audit_failure');
      expect(
        (await request('/organization/accept-invitation', { invitationId }, invited.cookie)).status,
      ).toBe(200);
      const target = (await db.select().from(authSchema.member)).find(
        (entry) => entry.userId === invited.id,
      )!;
      await db.execute(
        "ALTER TABLE audit_logs ADD CONSTRAINT fixture_audit_failure CHECK (action <> 'membership.role_changed')",
      );
      expect(
        (
          await request(
            '/organization/update-member-role',
            { organizationId, memberId: target.id, role: 'admin' },
            owner.cookie,
          )
        ).status,
      ).toBe(503);
      expect(
        (await db.select().from(authSchema.member)).find((entry) => entry.id === target.id)?.role,
      ).toBe('member');
      await db.execute('ALTER TABLE audit_logs DROP CONSTRAINT fixture_audit_failure');
      await db.execute(
        "ALTER TABLE audit_logs ADD CONSTRAINT fixture_audit_failure CHECK (action <> 'membership.removed')",
      );
      expect(
        (
          await request(
            '/organization/remove-member',
            { organizationId, memberIdOrEmail: target.id },
            owner.cookie,
          )
        ).status,
      ).toBe(503);
      expect(await db.select().from(authSchema.member)).toHaveLength(2);
      await db.execute('ALTER TABLE audit_logs DROP CONSTRAINT fixture_audit_failure');
      const canceled = idResponseSchema.parse(
        await (
          await request(
            '/organization/invite-member',
            { organizationId, email: 'cancel-rollback@example.invalid', role: 'member' },
            owner.cookie,
          )
        ).json(),
      ).id;
      const outbox = () =>
        createWithTenant(db)({ organizationId }, async ({ repositories }) =>
          (await repositories.events.pending(100)).map((event) => event.id),
        );
      const pending = await outbox();
      await db.execute(
        "ALTER TABLE audit_logs ADD CONSTRAINT fixture_audit_failure CHECK (action <> 'invitation.canceled')",
      );
      expect(
        (await request('/organization/cancel-invitation', { invitationId: canceled }, owner.cookie))
          .status,
      ).toBe(503);
      expect(
        (await db.select().from(authSchema.invitation)).find((entry) => entry.id === canceled)
          ?.status,
      ).toBe('pending');
      expect(await outbox()).toEqual(pending);
    });
  },
  20_000,
);

test.skipIf(!available)(
  'concurrent last-owner demotions preserve one owner across independent requests',
  async () => {
    await scenario(async (fixture) => {
      const { request, db } = fixture;
      const first = await createVerifiedUser(fixture);
      const second = await createVerifiedUser(fixture);
      const organizationId = idResponseSchema.parse(
        await (
          await request('/organization/create', { name: 'Owners', slug: 'owners' }, first.cookie)
        ).json(),
      ).id;
      const invitationId = idResponseSchema.parse(
        await (
          await request(
            '/organization/invite-member',
            { organizationId, email: second.email, role: 'member' },
            first.cookie,
          )
        ).json(),
      ).id;
      await request('/organization/accept-invitation', { invitationId }, second.cookie);
      // Model an imported/co-owned organization; new ownership grants stay disabled in M1.
      await db.update(authSchema.member).set({ role: 'owner' });
      const members = await db.select().from(authSchema.member);
      const results = await Promise.all(
        [first, second].map((user) =>
          request(
            '/organization/update-member-role',
            {
              organizationId,
              memberId: members.find((entry) => entry.userId === user.id)!.id,
              role: 'admin',
            },
            user.cookie,
          ),
        ),
      );
      expect(results.map((response) => response.status).toSorted((a, b) => a - b)).toEqual([
        200, 409,
      ]);
      const after = await db.select().from(authSchema.member);
      expect(after.filter((entry) => entry.role === 'owner')).toHaveLength(1);
      const audit = await createWithTenant(db)({ organizationId }, ({ repositories }) =>
        repositories.audit.list({ limit: 100 }),
      );
      const changes = audit.filter((entry) => entry.action === 'membership.role_changed');
      expect(changes).toHaveLength(1);
      expect(changes[0]?.actorId).toBe(after.find((entry) => entry.role === 'admin')?.userId);
    });
  },
  15_000,
);
