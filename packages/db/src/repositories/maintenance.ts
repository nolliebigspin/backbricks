import { AppError, MAX_MAINTENANCE_BATCH, type TenantTransaction } from '@backbricks/core';
import { sql } from 'drizzle-orm';

import type { Database } from '../client.ts';
import { session, verification, invitation } from '../schema/auth.generated.ts';
import { auditLogs, events } from '../schema/platform.ts';
import {
  rateLimitBuckets,
  powChallengesUsed,
  authTokenReplays,
  idempotencyKeys,
} from '../schema/technical.ts';
import { transactionFor } from '../transaction-binding.ts';
import { purgeExpiredRows } from './maintenance-delete.ts';
import { createRepositoryScope } from './scope.ts';

/** Restricted worker capability; it is absent from tenant repositories and HTTP/module service views. */
export function createMaintenanceRepository(db: Database) {
  return {
    purgeGlobal(now: Date, limit = MAX_MAINTENANCE_BATCH) {
      return db.transaction(async (tx) => ({
        rateLimits: await purgeExpiredRows(
          tx,
          rateLimitBuckets,
          rateLimitBuckets.expiresAt,
          now,
          limit,
        ),
        proofs: await purgeExpiredRows(
          tx,
          powChallengesUsed,
          powChallengesUsed.expiresAt,
          now,
          limit,
        ),
        authReplays: await purgeExpiredRows(
          tx,
          authTokenReplays,
          authTokenReplays.expiresAt,
          now,
          limit,
        ),
        sessions: await purgeExpiredRows(tx, session, session.expiresAt, now, limit),
        verifications: await purgeExpiredRows(tx, verification, verification.expiresAt, now, limit),
        invitations: await purgeExpiredRows(tx, invitation, invitation.expiresAt, now, limit),
      }));
    },
    async purgeTenant(handle: TenantTransaction, now: Date, limit = MAX_MAINTENANCE_BATCH) {
      if (handle.context.principal) throw new AppError('forbidden');
      const scope = createRepositoryScope(handle.context, handle.assertActive);
      const tx = transactionFor(handle);
      // The trigger still independently rejects updates and deletion of unexpired audit rows.
      await tx.execute(sql`select set_config('app.allow_audit_purge', 'on', true)`);
      const audit = await purgeExpiredRows(
        tx,
        auditLogs,
        auditLogs.expiresAt,
        now,
        limit,
        scope.where(auditLogs),
      );
      await tx.execute(sql`select set_config('app.allow_audit_purge', 'off', true)`);
      return {
        audit,
        events: await purgeExpiredRows(
          tx,
          events,
          events.expiresAt,
          now,
          limit,
          scope.where(events),
        ),
        idempotency: await purgeExpiredRows(
          tx,
          idempotencyKeys,
          idempotencyKeys.expiresAt,
          now,
          limit,
          scope.where(idempotencyKeys),
        ),
      };
    },
  };
}
