import {
  AppError,
  MAX_PAGE_SIZE,
  notificationRuleSchema,
  notificationRecipientSchema,
  type NotificationRuleRepository,
} from '@backbricks/core';
import { and, asc, desc, eq, getColumns, inArray, isNull, or, sql } from 'drizzle-orm';

import type { DbTransaction } from '../client.ts';
import { member, user } from '../schema/auth.generated.ts';
import { notificationRules } from '../schema/platform.ts';
import { createOrganizationIdentityStore } from './organization-identity.ts';
import { beforeCursor, requiredRow, type RepositoryScope } from './scope.ts';

const required = (rows: unknown[]) => requiredRow(rows, notificationRuleSchema);
// Configuration columns only; delivery throttle state stays internal to the notification jobs.
const {
  throttleWindowStart: _windowStart,
  throttleSent: _sent,
  throttleSuppressed: _suppressed,
  ...ruleColumns
} = getColumns(notificationRules);

/** Tenant configuration queries; auth identities are projected only under the caller's org scope. */
export function createNotificationRuleRepository(
  tx: DbTransaction,
  scope: RepositoryScope,
): NotificationRuleRepository {
  const t = notificationRules;
  const where = (...conditions: Parameters<typeof and>) => and(scope.where(t), ...conditions);
  return {
    async lock() {
      scope.assertActive();
      if (!(await createOrganizationIdentityStore(tx).lock(scope.context.organizationId)))
        throw new AppError('not_found');
    },
    async list(page) {
      scope.project();
      return (
        await tx
          .select(ruleColumns)
          .from(t)
          .where(where(beforeCursor(t, page)))
          .orderBy(desc(t.createdAt), desc(t.id))
          .limit(scope.limit(page))
      ).map((row) => notificationRuleSchema.parse(row));
    },
    async get(id) {
      scope.project();
      return required(
        await tx
          .select(ruleColumns)
          .from(t)
          .where(where(eq(t.id, id)))
          .limit(1),
      );
    },
    async insert(input) {
      return required(
        await tx
          .insert(t)
          .values({ ...input, ...scope.project() })
          .returning(ruleColumns),
      );
    },
    async update(id, input) {
      scope.project();
      return required(
        await tx
          .update(t)
          .set(input)
          .where(where(eq(t.id, id)))
          .returning(ruleColumns),
      );
    },
    async delete(id) {
      scope.project();
      required(
        await tx
          .delete(t)
          .where(where(eq(t.id, id)))
          .returning(ruleColumns),
      );
    },
    async recipients(userIds) {
      scope.project();
      const rows = await tx
        .select({ id: user.id, name: user.name, email: user.email })
        .from(member)
        .innerJoin(user, eq(member.userId, user.id))
        .where(
          and(
            eq(member.organizationId, scope.context.organizationId),
            eq(user.emailVerified, true),
            userIds ? inArray(user.id, [...userIds]) : undefined,
          ),
        )
        .orderBy(asc(user.name), asc(user.id))
        .limit(MAX_PAGE_SIZE);
      return rows.map((row) => notificationRecipientSchema.parse(row));
    },
    async matching(eventType, instanceId, page) {
      scope.project();
      return (
        await tx
          .select(ruleColumns)
          .from(t)
          .where(
            where(
              eq(t.enabled, true),
              eq(t.eventType, eventType),
              beforeCursor(t, page),
              or(isNull(t.instanceId), instanceId ? eq(t.instanceId, instanceId) : undefined),
            ),
          )
          .orderBy(desc(t.createdAt), desc(t.id))
          .limit(scope.limit(page))
      ).map((row) => notificationRuleSchema.parse(row));
    },
    async throttleState(id) {
      scope.project();
      const [row] = await tx
        .select({
          windowStart: t.throttleWindowStart,
          sent: t.throttleSent,
          suppressed: t.throttleSuppressed,
        })
        .from(t)
        .where(where(eq(t.id, id)))
        .for('update');
      return row ?? null;
    },
    async saveThrottle(id, state) {
      scope.project();
      await tx
        .update(t)
        .set({
          throttleWindowStart: state.windowStart,
          throttleSent: state.sent,
          throttleSuppressed: state.suppressed,
        })
        .where(where(eq(t.id, id)));
    },
    async removeRecipient(userId, now) {
      const next = sql`array_remove(${t.recipientUserIds}, ${userId})`;
      const rows = await tx
        .update(t)
        .set({
          recipientUserIds: next,
          enabled: sql`${t.enabled} and cardinality(${next}) > 0`,
          updatedAt: now,
        })
        .where(where(sql`${userId} = any(${t.recipientUserIds})`))
        .returning({ id: t.id });
      return rows.length;
    },
  };
}
