import {
  membershipSchema,
  authInvitationSchema,
  type OrganizationIdentityStore,
} from '@backbricks/core';
import { and, count, eq } from 'drizzle-orm';

import type { DbTransaction } from '../client.ts';
import { invitation, member, organization } from '../schema/auth.generated.ts';

const membershipFields = {
  id: member.id,
  organizationId: member.organizationId,
  userId: member.userId,
  role: member.role,
};

/** Identity-only projections and row locks; all tenant platform records still require withTenant. */
export function createOrganizationIdentityStore(tx: DbTransaction): OrganizationIdentityStore {
  return {
    async lock(organizationId) {
      const rows = await tx
        .select({ id: organization.id })
        .from(organization)
        .where(eq(organization.id, organizationId))
        .for('update');
      return rows.length === 1;
    },
    async membership(organizationId, userId) {
      const rows = await tx
        .select(membershipFields)
        .from(member)
        .where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)))
        .limit(1);
      return rows[0] ? membershipSchema.parse(rows[0]) : null;
    },
    async member(organizationId, memberId) {
      const rows = await tx
        .select(membershipFields)
        .from(member)
        .where(and(eq(member.organizationId, organizationId), eq(member.id, memberId)))
        .limit(1);
      return rows[0] ? membershipSchema.parse(rows[0]) : null;
    },
    async ownerCount(organizationId) {
      const rows = await tx
        .select({ count: count() })
        .from(member)
        .where(and(eq(member.organizationId, organizationId), eq(member.role, 'owner')));
      return rows[0]?.count ?? 0;
    },
    async invitation(invitationId) {
      const rows = await tx
        .select({
          id: invitation.id,
          organizationId: invitation.organizationId,
          email: invitation.email,
          role: invitation.role,
          status: invitation.status,
          expiresAt: invitation.expiresAt,
        })
        .from(invitation)
        .where(eq(invitation.id, invitationId))
        .limit(1);
      return rows[0] ? authInvitationSchema.parse(rows[0]) : null;
    },
  };
}
