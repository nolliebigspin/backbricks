import { AppError } from '../errors/app-error.ts';
import { meetsOrganizationRole } from '../http/route-policy.ts';
import type { TenantTransaction } from '../tenancy/tenant-context.ts';

/** Shared by route declarations and every configuration mutation path, including future apply/rollback. */
export const CONFIG_ACCESS = {
  read: { session: { role: 'member' }, secretKey: { scope: 'config:read' } },
  write: { session: { role: 'admin' }, secretKey: { scope: 'config:write' } },
} as const;
export const CONFIG_DESTRUCTIVE_SCOPE = 'config:destructive';

/** Destructive access supplements write permission; granting only destructive never permits a write. */
export function requireConfigAccess(
  tx: TenantTransaction,
  access: keyof typeof CONFIG_ACCESS,
  destructive = false,
) {
  tx.assertActive();
  const principal = tx.context.principal;
  if (!principal) throw new AppError('unauthorized');
  const policy = CONFIG_ACCESS[access];
  if (
    principal.kind === 'session'
      ? !meetsOrganizationRole(principal.role, policy.session.role)
      : !principal.scopes.includes(policy.secretKey.scope) ||
        (destructive && !principal.scopes.includes(CONFIG_DESTRUCTIVE_SCOPE))
  )
    throw new AppError('forbidden');
  return principal;
}
