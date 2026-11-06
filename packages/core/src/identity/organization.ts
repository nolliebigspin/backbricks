import { z } from 'zod';

import { organizationRoleSchema } from '../http/route-policy.ts';

const identityId = z.string().min(1).max(128);
/** Minimal identity projections shared by auth policy and trusted principal resolution. */
export const membershipSchema = z
  .object({
    id: identityId,
    organizationId: identityId,
    userId: identityId,
    role: organizationRoleSchema,
  })
  .strict();
export type Membership = z.infer<typeof membershipSchema>;
export const authInvitationSchema = z
  .object({
    id: identityId,
    organizationId: identityId,
    email: z.email(),
    role: organizationRoleSchema.nullable().transform((role) => role ?? 'member'),
    status: z.enum(['pending', 'accepted', 'rejected', 'canceled']),
    expiresAt: z.date(),
  })
  .strict();
export type AuthInvitation = z.infer<typeof authInvitationSchema>;

/** Auth-table exception to tenant repositories; only the request-bound identity layer receives this. */
export interface OrganizationIdentityStore {
  lock(organizationId: string): Promise<boolean>;
  membership(organizationId: string, userId: string): Promise<Membership | null>;
  member(organizationId: string, memberId: string): Promise<Membership | null>;
  ownerCount(organizationId: string): Promise<number>;
  invitation(invitationId: string): Promise<AuthInvitation | null>;
}
