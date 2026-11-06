import type { AuthInvitation } from '@backbricks/core';
import { z } from 'zod';

import { AUTH_MIN_PASSWORD_LENGTH } from '../constants.ts';
import type { AuthPersistence, DashboardAuthOptions } from '../contracts.ts';
import { AUTH_BASE_PATH, authFailure } from '../http.ts';
import { prepareOrganizationOperation, type OrganizationActor } from './operation.ts';

const invitationSignupSchema = z
  .object({
    invitationId: z.string().min(1).max(128),
    email: z.email(),
    name: z.string().trim().min(1).max(120),
    password: z.string().min(AUTH_MIN_PASSWORD_LENGTH).max(128),
    callbackURL: z.string().optional(),
    rememberMe: z.boolean().optional(),
  })
  .strict();

/** A live invitation plus matching identity is the only exception to closed registration. */
export async function prepareInvitationSignup(
  input: Record<string, unknown>,
  persistence: AuthPersistence,
  options: DashboardAuthOptions,
): Promise<AuthInvitation | undefined> {
  if (input['invitationId'] === undefined) return undefined;
  const parsed = invitationSignupSchema.safeParse(input);
  if (!parsed.success) throw authFailure(400, 'INVALID_REQUEST');
  let invitation = await persistence.identity.invitation(parsed.data.invitationId);
  if (!invitation || !(await persistence.identity.lock(invitation.organizationId)))
    throw authFailure(404, 'NOT_FOUND');
  invitation = await persistence.identity.invitation(parsed.data.invitationId);
  if (
    !invitation ||
    invitation.status !== 'pending' ||
    invitation.expiresAt <= options.clock.now() ||
    invitation.email.toLowerCase() !== parsed.data.email.toLowerCase()
  )
    throw authFailure(404, 'NOT_FOUND');
  if (invitation.role === 'owner') throw authFailure(403, 'OWNERSHIP_TRANSFER_DISABLED');
  return invitation;
}

/** New identity, session, invitation acceptance and audit commit together or disappear together. */
export async function completeInvitationSignup(
  invitation: AuthInvitation,
  response: Response,
  deps: {
    request: Request;
    persistence: AuthPersistence;
    options: DashboardAuthOptions;
    ipHash: string;
    dispatch: (request: Request) => Promise<Response>;
    actor: (headers: Headers) => Promise<OrganizationActor | null>;
  },
): Promise<Response> {
  const headers = new Headers(deps.request.headers);
  const cookies = response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ');
  if (!cookies) throw authFailure(409, 'ACCOUNT_ALREADY_EXISTS');
  headers.set('cookie', cookies);
  headers.set('content-type', 'application/json');
  const actor = await deps.actor(headers);
  if (
    !actor ||
    !actor.emailVerified ||
    actor.email.toLowerCase() !== invitation.email.toLowerCase()
  )
    throw authFailure(401, 'UNAUTHORIZED');
  const input = { invitationId: invitation.id };
  const operation = await prepareOrganizationOperation(
    '/organization/accept-invitation',
    input,
    actor,
    deps.persistence,
    deps.options,
    deps.ipHash,
  );
  const accepted = await deps.dispatch(
    new Request(
      new URL(`${AUTH_BASE_PATH}/organization/accept-invitation`, deps.options.config.publicUrl)
        .href,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(input),
      },
    ),
  );
  if (accepted.status >= 400) throw accepted;
  await operation.finish(accepted);
  return response;
}
