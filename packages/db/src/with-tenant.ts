import type { WithTenant } from '@backbricks/core';
import { sql } from 'drizzle-orm';

import type { Database, DbTransaction } from './client.ts';

/**
 * `withTenant` (ARCHITECTURE §B.6, I1): every tenant-table access runs in a transaction whose
 * settings `app.org_id` / `app.project_id` are bound to the tenant. The settings prepare
 * row-level security (C1.4); P1.2/P1.3 add the tenant-scoped repositories on top.
 * `set_config(…, true)` is transaction-local and takes bind parameters (`SET LOCAL` can't).
 */
export function createWithTenant(db: Database): WithTenant<DbTransaction> {
  return (ctx, fn) => {
    if (ctx.organizationId === '') throw new Error('withTenant needs an organizationId');
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('app.org_id', ${ctx.organizationId}, true),
                   set_config('app.project_id', ${ctx.projectId ?? ''}, true)`,
      );
      return fn(tx);
    });
  };
}
