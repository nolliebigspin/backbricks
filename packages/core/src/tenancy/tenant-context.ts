/**
 * Trusted tenant scope of a request or job (ARCHITECTURE §B.6, I1). P1.3b adds the
 * authenticated principal and scopes; `withTenant` never grants membership or permissions.
 */
import type { ModuleRepositories, TenantRepositories } from './repositories.ts';

export type TenantContext = {
  readonly organizationId: string;
  readonly projectId?: string;
};

/**
 * The only way to reach tenant tables: runs `fn` in a transaction whose settings
 * (`app.org_id`, `app.project_id`) are bound to the tenant. Implemented by @backbricks/db.
 */
export type WithTenant<Tx = TenantTransaction> = <T>(
  ctx: TenantContext,
  fn: (tx: Tx) => Promise<T>,
) => Promise<T>;

/** Request-scoped identity and repositories. The driver remains inside repository factories. */
export type TenantTransaction = Readonly<{
  context: TenantContext;
  identity: symbol;
  repositories: TenantRepositories;
  modules: Readonly<Partial<ModuleRepositories>>;
}>;
