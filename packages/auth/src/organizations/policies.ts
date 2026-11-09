import { organizationRoleSchema, type OrganizationRole } from '@backbricks/core';
import { z } from 'zod';

import { AUTH_BASE_PATH, AUTH_BODY_LIMIT_BYTES } from '../constants.ts';

const id = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);
const organizationId = z.object({ organizationId: id }).strict();
const invitationId = z.object({ invitationId: id }).strict();
type Requirement =
  | { role: OrganizationRole }
  | { scope: 'organization:create' | 'organization:list' | 'invitation:accept' };
type OrganizationPolicy = {
  method: 'GET' | 'POST';
  requirement: Requirement;
  isolationCase: string;
  input: z.ZodType<Record<string, unknown>>;
};

/** One policy/input registry for the mounted library surface and its isolation coverage. */
export const organizationPolicies = {
  '/organization/create': {
    method: 'POST',
    requirement: { scope: 'organization:create' },
    isolationCase: 'organization.create',
    input: z
      .object({
        name: z.string().trim().min(1).max(120),
        slug: z
          .string()
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
          .max(63),
      })
      .strict(),
  },
  '/organization/list': {
    method: 'GET',
    requirement: { scope: 'organization:list' },
    isolationCase: 'organization.list',
    input: z.object({}).strict(),
  },
  '/organization/set-active': {
    method: 'POST',
    requirement: { role: 'member' },
    isolationCase: 'organization.select',
    input: z.object({ organizationId: id.nullable() }).strict(),
  },
  '/organization/get-organization': {
    method: 'GET',
    requirement: { role: 'member' },
    isolationCase: 'organization.read',
    input: organizationId,
  },
  '/organization/get-active-member': {
    method: 'GET',
    requirement: { role: 'member' },
    isolationCase: 'membership.read_own',
    input: z.object({}).strict(),
  },
  '/organization/list-members': {
    method: 'GET',
    requirement: { role: 'admin' },
    isolationCase: 'membership.list',
    input: organizationId,
  },
  '/organization/list-invitations': {
    method: 'GET',
    requirement: { role: 'admin' },
    isolationCase: 'invitation.list',
    input: organizationId,
  },
  '/organization/invite-member': {
    method: 'POST',
    requirement: { role: 'admin' },
    isolationCase: 'invitation.create',
    input: z
      .object({
        organizationId: id,
        email: z.email(),
        role: z.enum(['admin', 'member']),
        resend: z.boolean().optional(),
      })
      .strict(),
  },
  '/organization/cancel-invitation': {
    method: 'POST',
    requirement: { role: 'admin' },
    isolationCase: 'invitation.cancel',
    input: invitationId,
  },
  '/organization/accept-invitation': {
    method: 'POST',
    requirement: { scope: 'invitation:accept' },
    isolationCase: 'invitation.accept',
    input: invitationId,
  },
  '/organization/remove-member': {
    method: 'POST',
    requirement: { role: 'admin' },
    isolationCase: 'membership.remove',
    input: z.object({ organizationId: id, memberIdOrEmail: id }).strict(),
  },
  '/organization/update-member-role': {
    method: 'POST',
    requirement: { role: 'admin' },
    isolationCase: 'membership.role',
    input: z.object({ organizationId: id, memberId: id, role: organizationRoleSchema }).strict(),
  },
} as const satisfies Record<string, OrganizationPolicy>;

export function organizationPolicy(endpoint: string): OrganizationPolicy | null {
  return Object.entries(organizationPolicies).find(([path]) => path === endpoint)?.[1] ?? null;
}

/** Read-only access declarations for isolation-suite coverage; never expose live policy objects. */
export const organizationRouteManifest = Object.freeze(
  Object.entries(organizationPolicies).map(([path, policy]) =>
    Object.freeze({
      path: `${AUTH_BASE_PATH}${path}`,
      method: policy.method,
      requirement: Object.freeze({ ...policy.requirement }),
      isolationCase: policy.isolationCase,
      bodyLimitBytes: AUTH_BODY_LIMIT_BYTES,
    }),
  ),
);
