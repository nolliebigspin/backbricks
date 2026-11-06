import { AppError, MAX_MAINTENANCE_BATCH, type TenantTransaction } from '@backbricks/core';
import { asc, gt } from 'drizzle-orm';

import type { Database } from '../client.ts';
import { organization } from '../schema/auth.generated.ts';
import { transactionFor } from '../transaction-binding.ts';
import { securityRecipients } from './security-recipients.ts';

/** Identity-table exception for worker fan-out: IDs only; business access still requires withTenant. */
export function maintenanceOrganizationIds(
  db: Database,
  after?: string,
  limit = MAX_MAINTENANCE_BATCH,
) {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_MAINTENANCE_BATCH)
    throw new AppError('invalid_request');
  return db
    .select({ id: organization.id })
    .from(organization)
    .where(after ? gt(organization.id, after) : undefined)
    .orderBy(asc(organization.id))
    .limit(limit);
}
/** Resolve current verified recipients in the outbox transaction, without reentering the pool. */
export function securityRecipientsForTenant(tx: TenantTransaction) {
  return securityRecipients(transactionFor(tx), tx.context.organizationId);
}
