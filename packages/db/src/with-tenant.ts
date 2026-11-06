import {
  principalSchema,
  AppError,
  type ModuleRepositories,
  type TenantContext,
  type WithTenant,
} from '@backbricks/core';
import { sql } from 'drizzle-orm';

import type { Database, DbTransaction } from './client.ts';
import { createTenantRepositories } from './repositories/index.ts';
import { createRepositoryScope } from './repositories/scope.ts';

/**
 * `withTenant` (ARCHITECTURE §B.6, I1): every tenant-table access runs in a transaction whose
 * settings `app.org_id` / `app.project_id` are bound to the tenant. Core and module repository
 * bindings share this transaction; domain callbacks receive no driver. Escaped handles fail
 * after the callback ends. The settings also prepare row-level security (C1.4).
 * `set_config(…, true)` is transaction-local and takes bind parameters (`SET LOCAL` can't).
 */
export function createWithTenant(
  db: Pick<Database, 'transaction'>,
  createModuleRepositories?: (
    tx: DbTransaction,
    context: TenantContext,
    assertActive: () => void,
  ) => Partial<ModuleRepositories>,
): WithTenant {
  return (ctx, fn) => {
    if (ctx.organizationId === '') throw new Error('withTenant needs an organizationId');
    const context = Object.freeze({
      ...ctx,
      ...(ctx.principal ? { principal: principalSchema.parse(ctx.principal) } : {}),
    });
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('app.org_id', ${context.organizationId}, true),
                   set_config('app.project_id', ${context.projectId ?? ''}, true)`,
      );
      let active = true;
      const assertActive = () => {
        if (!active) throw new Error('Tenant transaction has already ended.');
      };
      try {
        const scope = createRepositoryScope(context, assertActive);
        const repositories = createTenantRepositories(tx, scope);
        if (context.projectId) {
          const project = await repositories.projects.get(context.projectId);
          if (project.organizationId !== context.organizationId || project.id !== context.projectId)
            throw new AppError('not_found');
        }
        return await fn(
          Object.freeze({
            context,
            identity: Symbol('tenant transaction'),
            assertActive,
            repositories,
            modules: Object.freeze(createModuleRepositories?.(tx, context, assertActive) ?? {}),
          }),
        );
      } finally {
        active = false;
      }
    });
  };
}
