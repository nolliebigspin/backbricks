import { expect } from 'bun:test';

import { authSchema } from '@backbricks/db';

import { idResponseSchema } from '../auth-fixture.ts';
import type { IsolationFixture } from './setup.ts';
import type { Cases } from './suite.ts';

/** Concrete builders for the auth registry's declared operations. No production IDs or data. */
export function authIsolationCases(f: IsolationFixture): Cases {
  const { owner, other, admin, member, invited, organizationId, foreignId } = f;
  const post = (action: string, body: unknown, cookie = owner.cookie) => ({
    path: `/organization/${action}`,
    body,
    cookie,
  });
  const get = (action: string, id = organizationId) => ({
    path: `/organization/${action}?organizationId=${id}`,
    cookie: owner.cookie,
  });
  return {
    'organization.create': {
      kind: 'creation',
      denied: [
        {
          request: post('create', { name: 'Forbidden', slug: 'forbidden', userId: other.id }),
          status: 400,
        },
      ],
      allowed: post('create', { name: 'Created fixture', slug: 'created-fixture' }),
      verify: async (response) => {
        const id = idResponseSchema.parse(await response.json()).id;
        const memberships = await f.db.select().from(authSchema.member);
        expect(memberships.filter((row) => row.organizationId === id)).toMatchObject([
          { userId: owner.id, role: 'owner' },
        ]);
        await f.request('/organization/set-active', { organizationId }, owner.cookie);
      },
    },
    'organization.list': {
      kind: 'collection',
      read: { path: '/organization/list', cookie: owner.cookie },
      present: [organizationId],
      absent: [foreignId],
    },
    'organization.select': {
      kind: 'mutation',
      denied: [{ request: post('set-active', { organizationId: foreignId }), status: 404 }],
      allowed: post('set-active', { organizationId }),
    },
    'organization.read': {
      kind: 'resource',
      own: get('get-organization'),
      foreign: get('get-organization', foreignId),
    },
    'membership.read_own': {
      kind: 'resource',
      own: { path: '/organization/get-active-member', cookie: owner.cookie },
      foreign: { path: '/organization/get-active-member', cookie: owner.cookie },
      beforeForeign: async () => {
        await f.db.update(authSchema.session).set({ activeOrganizationId: foreignId });
      },
      afterForeign: async () => {
        await Promise.all(
          [owner, admin, member].map((user) =>
            f.request('/organization/set-active', { organizationId }, user.cookie),
          ),
        );
        await f.request('/organization/set-active', { organizationId: null }, invited.cookie);
      },
    },
    'membership.list': {
      kind: 'collection',
      read: get('list-members'),
      present: [owner.id, admin.id, member.id],
      absent: [other.id],
      foreign: get('list-members', foreignId),
    },
    'invitation.list': {
      kind: 'collection',
      read: get('list-invitations'),
      present: [f.acceptId, f.cancelId],
      absent: [f.foreignInvite],
      foreign: get('list-invitations', foreignId),
    },
    'invitation.create': {
      kind: 'mutation',
      denied: [
        {
          request: post('invite-member', {
            organizationId: foreignId,
            email: 'denied@example.invalid',
            role: 'member',
          }),
          status: 404,
        },
        {
          request: post(
            'invite-member',
            { organizationId, email: 'denied@example.invalid', role: 'member' },
            member.cookie,
          ),
          status: 403,
        },
      ],
      allowed: post('invite-member', {
        organizationId,
        email: 'created@example.invalid',
        role: 'member',
      }),
      verify: async (response) => {
        const id = idResponseSchema.parse(await response.json()).id;
        expect(
          (await f.db.select().from(authSchema.invitation)).find((row) => row.id === id)
            ?.organizationId,
        ).toBe(organizationId);
      },
    },
    'invitation.cancel': {
      kind: 'mutation',
      denied: [
        { request: post('cancel-invitation', { invitationId: f.foreignInvite }), status: 404 },
        {
          request: post('cancel-invitation', { invitationId: f.cancelId }, member.cookie),
          status: 403,
        },
      ],
      allowed: post('cancel-invitation', { invitationId: f.cancelId }),
    },
    'invitation.accept': {
      kind: 'mutation',
      denied: [
        {
          request: post('accept-invitation', { invitationId: f.acceptId }, other.cookie),
          status: 404,
        },
        {
          request: post('accept-invitation', { invitationId: f.foreignInvite }, invited.cookie),
          status: 404,
        },
      ],
      allowed: post('accept-invitation', { invitationId: f.acceptId }, invited.cookie),
    },
    'membership.remove': {
      kind: 'mutation',
      denied: [
        {
          request: post('remove-member', { organizationId, memberIdOrEmail: f.memberId(other.id) }),
          status: 404,
        },
        {
          request: post(
            'remove-member',
            { organizationId, memberIdOrEmail: f.memberId(admin.id) },
            member.cookie,
          ),
          status: 403,
        },
      ],
      allowed: async () => {
        const target = (await f.db.select().from(authSchema.member)).find(
          (row) => row.userId === invited.id,
        );
        if (!target) throw new Error('Expected accepted fixture member');
        return post('remove-member', { organizationId, memberIdOrEmail: target.id });
      },
    },
    'membership.role': {
      kind: 'mutation',
      denied: [
        {
          request: post('update-member-role', {
            organizationId,
            memberId: f.memberId(other.id),
            role: 'member',
          }),
          status: 404,
        },
        {
          request: post(
            'update-member-role',
            { organizationId, memberId: f.memberId(admin.id), role: 'member' },
            member.cookie,
          ),
          status: 403,
        },
        {
          request: post(
            'update-member-role',
            { organizationId, memberId: f.memberId(owner.id), role: 'member' },
            admin.cookie,
          ),
          status: 403,
        },
      ],
      allowed: post('update-member-role', {
        organizationId,
        memberId: f.memberId(admin.id),
        role: 'member',
      }),
    },
  };
}
