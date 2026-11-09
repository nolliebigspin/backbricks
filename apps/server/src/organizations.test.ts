import { expect, test } from 'bun:test';

import { authSchema, createWithTenant } from '@backbricks/db';
import { z } from '@hono/zod-openapi';

import {
  available,
  scenario,
  createVerifiedUser,
  idResponseSchema as idResult,
} from '../test/auth-fixture.ts';

test.skipIf(!available)(
  'organization lifecycle scopes membership and audits the authenticated actor',
  async () => {
    await scenario(async (fixture) => {
      const { request, db } = fixture;
      const owner = await createVerifiedUser(fixture);
      const admin = await createVerifiedUser(fixture);
      const member = await createVerifiedUser(fixture);
      expect(
        (await request('/organization/create', { name: 'Anonymous', slug: 'anonymous' })).status,
      ).toBe(401);
      const created = await request(
        '/organization/create',
        { name: 'First team', slug: 'first-team' },
        owner.cookie,
      );
      expect(created.status).toBe(200);
      const organizationId = idResult.parse(await created.json()).id;
      expect(
        (await request('/organization/get-active-member', undefined, owner.cookie)).status,
      ).toBe(200);
      expect(
        (await request('/organization/set-active', { organizationId }, owner.cookie)).status,
      ).toBe(200);
      expect(
        (
          await request(
            `/organization/list-members?organizationId=${organizationId}`,
            undefined,
            owner.cookie,
          )
        ).status,
      ).toBe(200);
      expect(
        (
          await request(
            `/organization/list-invitations?organizationId=${organizationId}`,
            undefined,
            owner.cookie,
          )
        ).status,
      ).toBe(200);
      const invite = await request(
        '/organization/invite-member',
        { organizationId, email: admin.email, role: 'admin' },
        owner.cookie,
      );
      expect(invite.status).toBe(200);
      const invitationId = idResult.parse(await invite.json()).id;
      expect(
        (await request('/organization/accept-invitation', { invitationId }, member.cookie)).status,
      ).toBe(404);
      expect(
        (await request('/organization/accept-invitation', { invitationId }, admin.cookie)).status,
      ).toBe(200);
      expect(
        (await request('/organization/accept-invitation', { invitationId }, admin.cookie)).status,
      ).toBe(404);
      const memberInvite = await request(
        '/organization/invite-member',
        { organizationId, email: member.email, role: 'member' },
        admin.cookie,
      );
      expect(memberInvite.status).toBe(200);
      expect(
        (
          await request(
            '/organization/accept-invitation',
            { invitationId: idResult.parse(await memberInvite.json()).id },
            member.cookie,
          )
        ).status,
      ).toBe(200);
      expect(
        (
          await request(
            '/organization/get-organization?organizationId=' + organizationId,
            undefined,
            member.cookie,
          )
        ).status,
      ).toBe(200);
      expect(
        (
          await request(
            '/organization/list-members?organizationId=' + organizationId,
            undefined,
            member.cookie,
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await request(
            '/organization/invite-member',
            { organizationId, email: 'outsider@example.invalid', role: 'member' },
            member.cookie,
          )
        ).status,
      ).toBe(403);
      const memberships = await db.select().from(authSchema.member);
      const ownerMember = memberships.find((entry) => entry.userId === owner.id)!;
      const adminMember = memberships.find((entry) => entry.userId === admin.id)!;
      expect(
        (
          await request(
            '/organization/update-member-role',
            { organizationId, memberId: ownerMember.id, role: 'member' },
            admin.cookie,
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await request(
            '/organization/remove-member',
            { organizationId, memberIdOrEmail: ownerMember.id },
            owner.cookie,
          )
        ).status,
      ).toBe(409);
      expect(
        (
          await request(
            '/organization/update-member-role',
            { organizationId, memberId: adminMember.id, role: 'member' },
            owner.cookie,
          )
        ).status,
      ).toBe(200);
      const audit = await createWithTenant(db)({ organizationId }, ({ repositories }) =>
        repositories.audit.list({ limit: 100 }),
      );
      const roleChange = audit.find((entry) => entry.action === 'membership.role_changed');
      expect(roleChange).toMatchObject({ actorId: owner.id, targetId: adminMember.id });
      expect(roleChange?.changes).toMatchObject({
        previousRole: 'admin',
        role: 'member',
        changedFields: ['role'],
      });
      const serialized = JSON.stringify(audit);
      expect(serialized).not.toContain(admin.email);
      expect(serialized).not.toContain(invitationId);
      expect(
        (
          await request(
            '/organization/remove-member',
            { organizationId, memberIdOrEmail: adminMember.id },
            owner.cookie,
          )
        ).status,
      ).toBe(200);
      expect(
        (
          await request(
            '/organization/get-organization?organizationId=' + organizationId,
            undefined,
            admin.cookie,
          )
        ).status,
      ).toBe(404);
    });
  },
  20_000,
);

test.skipIf(!available)(
  'foreign organizations and member IDs return 404; unsafe plugin routes stay disabled',
  async () => {
    await scenario(async (fixture) => {
      const { request, db } = fixture;
      const first = await createVerifiedUser(fixture);
      const second = await createVerifiedUser(fixture);
      const organizationId = idResult.parse(
        await (
          await request('/organization/create', { name: 'A', slug: 'a' }, first.cookie)
        ).json(),
      ).id;
      const foreignId = idResult.parse(
        await (
          await request('/organization/create', { name: 'B', slug: 'b' }, second.cookie)
        ).json(),
      ).id;
      const foreignMember = (await db.select().from(authSchema.member)).find(
        (entry) => entry.organizationId === foreignId,
      )!;
      expect(
        (
          await request(
            `/organization/get-organization?organizationId=${foreignId}`,
            undefined,
            first.cookie,
          )
        ).status,
      ).toBe(404);
      expect(
        (await request('/organization/set-active', { organizationId: foreignId }, first.cookie))
          .status,
      ).toBe(404);
      expect(
        (
          await request(
            '/organization/remove-member',
            { organizationId, memberIdOrEmail: foreignMember.id },
            first.cookie,
          )
        ).status,
      ).toBe(404);
      const listed = z
        .array(idResult)
        .parse(await (await request('/organization/list', undefined, first.cookie)).json());
      expect(listed.map((entry) => entry.id)).toEqual([organizationId]);
      await Promise.all(
        [
          'delete',
          'update',
          'leave',
          'add-member',
          'create-role',
          'create-team',
          'get-full-organization',
        ].map(async (path) => {
          const response = await request(`/organization/${path}`, { organizationId }, first.cookie);
          expect(response.status).toBe(404);
        }),
      );
    });
  },
  15_000,
);
