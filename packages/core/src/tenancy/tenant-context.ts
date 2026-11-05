/**
 * Tenant scope of a request or job (ARCHITECTURE §B.6, I1). P1.3 adds the principal and
 * scopes; this skeleton carries what `withTenant` needs to scope the database.
 */
export type TenantContext = {
  readonly organizationId: string;
  readonly projectId?: string;
};

/**
 * The only way to reach tenant tables: runs `fn` in a transaction whose settings
 * (`app.org_id`, `app.project_id`) are bound to the tenant. Implemented by @backbricks/db.
 */
export type WithTenant<Tx> = <T>(ctx: TenantContext, fn: (tx: Tx) => Promise<T>) => Promise<T>;
