import { z } from 'zod';

/** Global HTTP ceiling; individual routes must declare an equal or smaller body limit. */
export const DEFAULT_BODY_LIMIT_BYTES = 1024 * 1024;

/** Organization roles understood by the platform and its auth integration. */
export const organizationRoleSchema = z.enum(['owner', 'admin', 'member']);
export type OrganizationRole = z.infer<typeof organizationRoleSchema>;

const bodyLimitBytes = z.number().int().positive().max(DEFAULT_BODY_LIMIT_BYTES);

/** Every management operation states a rule for each credential kind it accepts. */
export const managementRoutePolicySchema = z
  .object({
    kind: z.literal('management'),
    bodyLimitBytes,
    session: z.object({ role: organizationRoleSchema }).strict().optional(),
    secretKey: z
      .object({ scope: z.string().min(1) })
      .strict()
      .optional(),
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
