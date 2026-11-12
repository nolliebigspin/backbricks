import { AppError } from '../errors/app-error.ts';
import { meetsOrganizationRole, type OrganizationRole } from '../http/route-policy.ts';
import type { TenantHandle } from '../tenancy/tenant-context.ts';

/** Session-only management operations never fall back to an API key's grants. */
export function requireSessionRole(tx: TenantHandle, role: OrganizationRole) {
  tx.assertActive();
  const principal = tx.context.principal;
  if (principal?.kind !== 'session' || !meetsOrganizationRole(principal.role, role))
    throw new AppError('forbidden');
  return principal;
}
