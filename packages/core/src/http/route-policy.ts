import { z } from 'zod';

import { scopeNameSchema } from '../keys/protocol.ts';

/** Global HTTP ceiling; individual routes must declare an equal or smaller body limit. */
export const DEFAULT_BODY_LIMIT_BYTES = 1024 * 1024;

/** Organization roles understood by the platform and its auth integration. */
export const organizationRoleSchema = z.enum(['owner', 'admin', 'member']);
export type OrganizationRole = z.infer<typeof organizationRoleSchema>;
const organizationRoleRanks: Record<OrganizationRole, number> = { member: 0, admin: 1, owner: 2 };

/** Compare the platform's single organization role against a declared minimum. */
export function meetsOrganizationRole(
  actual: OrganizationRole,
  minimum: OrganizationRole,
): boolean {
  return organizationRoleRanks[actual] >= organizationRoleRanks[minimum];
}

const bodyLimitBytes = z.number().int().positive().max(DEFAULT_BODY_LIMIT_BYTES);

/** Every management operation states a rule for each credential kind it accepts. */
export const managementRoutePolicySchema = z
  .object({
    kind: z.literal('management'),
    bodyLimitBytes,
    session: z.object({ role: organizationRoleSchema }).strict().optional(),
    secretKey: z.object({ scope: scopeNameSchema }).strict().optional(),
    isolationCase: z.string().min(1),
  })
  .strict()
  .refine((policy) => policy.session !== undefined || policy.secretKey !== undefined, {
    message: 'A management operation must declare a session role or a secret-key scope.',
  });

/** Access declaration shared by HTTP registration, authorization and isolation coverage. */
export const routePolicySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('public'), bodyLimitBytes }).strict(),
  managementRoutePolicySchema,
]);
export type RoutePolicy = z.infer<typeof routePolicySchema>;
export type ManagementRoutePolicy = z.infer<typeof managementRoutePolicySchema>;
