import { createHash } from 'node:crypto';

import {
  CORE_EVENTS,
  meetsOrganizationRole,
  organizationRoleSchema,
  type AuthInvitation,
  type Membership,
} from '@backbricks/core';
import { z } from 'zod';

import type { AuthPersistence, DashboardAuthOptions } from '../contracts.ts';
import { authFailure } from '../http.ts';
import { organizationPolicy } from './policies.ts';

export type OrganizationActor = {
  id: string;
  email: string;
  emailVerified: boolean;
  activeOrganizationId: string | null;
};
const resultSchema = z.object({ id: z.string().min(1) }).passthrough();
const invitationDigest = (id: string) => createHash('sha256').update(id).digest('hex');

/** Preflight and post-dispatch activity share the caller's outer identity transaction. */
export async function prepareOrganizationOperation(
  endpoint: string,
  input: Record<string, unknown>,
  actor: OrganizationActor | null,
  persistence: AuthPersistence,
  options: DashboardAuthOptions,
  ipHash: string,
) {
  const policy = organizationPolicy(endpoint);
  if (!policy) throw authFailure(404, 'NOT_FOUND');
  if (!actor) throw authFailure(401, 'UNAUTHORIZED');
  if (!actor.emailVerified) throw authFailure(403, 'EMAIL_NOT_VERIFIED');
  const parsed = policy.input.safeParse(input);
  if (!parsed.success) throw authFailure(400, 'INVALID_REQUEST');
  const data = parsed.data;
  const identity = persistence.identity;
  let organizationId = typeof data['organizationId'] === 'string' ? data['organizationId'] : null;
  let invitation: AuthInvitation | null = null;
  let target: Membership | null = null;
  if (typeof data['invitationId'] === 'string') {
    invitation = await identity.invitation(data['invitationId']);
    if (!invitation) throw authFailure(404, 'NOT_FOUND');
    organizationId = invitation.organizationId;
  }
  if (endpoint === '/organization/get-active-member') organizationId = actor.activeOrganizationId;
  if (organizationId) {
    if (!(await identity.lock(organizationId))) throw authFailure(404, 'NOT_FOUND');
    // Refresh under the org lock: acceptance/cancellation/removal may have just committed.
    if (invitation) invitation = await identity.invitation(invitation.id);
    if (endpoint === '/organization/accept-invitation') {
      if (invitation?.role === 'owner') throw authFailure(403, 'OWNERSHIP_TRANSFER_DISABLED');
      if (
        !invitation ||
        invitation.email.toLowerCase() !== actor.email.toLowerCase() ||
        invitation.status !== 'pending' ||
        invitation.expiresAt <= options.clock.now()
      )
        throw authFailure(404, 'NOT_FOUND');
    } else {
      const membership = await identity.membership(organizationId, actor.id);
      if (!membership) throw authFailure(404, 'NOT_FOUND');
      if (
        'role' in policy.requirement &&
        !meetsOrganizationRole(membership.role, policy.requirement.role)
      )
        throw authFailure(403, 'FORBIDDEN');
      const memberId = data['memberId'] ?? data['memberIdOrEmail'];
      if (typeof memberId === 'string') {
        target = await identity.member(organizationId, memberId);
        if (!target) throw authFailure(404, 'NOT_FOUND');
        if (target.role === 'owner' && membership.role !== 'owner')
          throw authFailure(403, 'FORBIDDEN');
        if (data['role'] === 'owner' && target.role !== 'owner')
          throw authFailure(403, 'OWNERSHIP_TRANSFER_DISABLED');
        if (
          target.role === 'owner' &&
          data['role'] !== 'owner' &&
          (await identity.ownerCount(organizationId)) <= 1
        )
          throw authFailure(409, 'LAST_OWNER');
      }
    }
  } else if (
    'role' in policy.requirement &&
    !(endpoint === '/organization/set-active' && data['organizationId'] === null)
  ) {
    throw authFailure(404, 'NOT_FOUND');
  }
  return {
    input: data,
    finish: async (response: Response): Promise<Response> => {
      let action: string | null = null;
      let targetType = 'organization';
      let targetId = organizationId;
      if (endpoint === '/organization/create') {
        organizationId = resultSchema.parse(await response.clone().json()).id;
        targetId = organizationId;
        action = CORE_EVENTS.organizationCreated;
      } else if (endpoint === '/organization/invite-member') {
        const invitationId = resultSchema.parse(await response.clone().json()).id;
        targetId = invitationDigest(invitationId);
        targetType = 'invitation';
        action = data['resend'] ? CORE_EVENTS.invitationResent : CORE_EVENTS.invitationCreated;
        if (!options.mailer) {
          const body = z.record(z.string(), z.unknown()).parse(await response.clone().json());
          const link = new URL('/accept-invitation', options.config.publicUrl);
          link.searchParams.set('invitationId', invitationId);
          response = Response.json(
            { ...body, invitationUrl: link.href },
            { status: response.status, headers: response.headers },
          );
        }
      } else if (endpoint === '/organization/cancel-invitation' && invitation) {
        action = CORE_EVENTS.invitationCanceled;
        targetType = 'invitation';
        targetId = invitationDigest(invitation.id);
      } else if (endpoint === '/organization/accept-invitation') {
        const body = z.object({ member: resultSchema }).parse(await response.clone().json());
        action = CORE_EVENTS.membershipCreated;
        targetType = 'membership';
        targetId = body.member.id;
      } else if (target) {
        action =
          endpoint === '/organization/remove-member'
            ? CORE_EVENTS.membershipRemoved
            : CORE_EVENTS.membershipRoleChanged;
        targetType = 'membership';
        targetId = target.id;
      }
      if (action && organizationId) {
        await persistence.withTenant({ organizationId }, async (tx) => {
          const notificationRulesChanged =
            target && endpoint === '/organization/remove-member'
              ? await tx.repositories.notificationRules.removeRecipient(
                  target.userId,
                  options.clock.now(),
                )
              : 0;
          const changes = {
            changedFields:
              endpoint === '/organization/update-member-role'
                ? ['role']
                : notificationRulesChanged
                  ? ['notificationRecipients']
                  : [],
            ...(notificationRulesChanged ? { count: notificationRulesChanged } : {}),
            ...(target && endpoint === '/organization/update-member-role'
              ? {
                  previousRole: target.role,
                  role: organizationRoleSchema.parse(data['role']),
                }
              : {}),
          };
          await options.audit.record(tx, {
            actorType: 'user',
            actorId: actor.id,
            action,
            targetType,
            targetId,
            changes,
            ipHash: Buffer.from(ipHash, 'hex'),
          });
          await options.events.publish(tx, {
            type: action,
            subjectType: targetType,
            subjectId: targetId,
            payload: changes,
          });
        });
      }
      return response;
    },
  };
}
