import {
  auditEntrySchema,
  eventRecordSchema,
  type AuditRepository,
  type EventRepository,
} from '@backbricks/core';
import { and, asc, desc, eq, gt, isNull } from 'drizzle-orm';

import type { DbTransaction } from '../client.ts';
import { auditLogs, events } from '../schema/platform.ts';
import { beforeCursor, requiredRow, type RepositoryScope } from './scope.ts';

export function createActivityRepositories(
  tx: DbTransaction,
  scope: RepositoryScope,
): { audit: AuditRepository; events: EventRepository } {
  const tenant = () => {
    scope.assertActive();
    return {
      organizationId: scope.context.organizationId,
      projectId: scope.context.projectId ?? null,
    };
  };
  const audit: AuditRepository = {
    async list(page, filters = {}, validAt) {
      const rows = await tx
        .select()
        .from(auditLogs)
        .where(
          and(
            scope.where(auditLogs),
            beforeCursor(auditLogs, page),
            validAt ? gt(auditLogs.expiresAt, validAt) : undefined,
            filters.projectId ? eq(auditLogs.projectId, filters.projectId) : undefined,
            filters.action ? eq(auditLogs.action, filters.action) : undefined,
            filters.actorType ? eq(auditLogs.actorType, filters.actorType) : undefined,
            filters.actorId ? eq(auditLogs.actorId, filters.actorId) : undefined,
          ),
        )
        .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
        .limit(scope.limit(page));
      return rows.map((row) => auditEntrySchema.parse(row));
    },
    async insert(input) {
      await tx.insert(auditLogs).values({
        ...input,
        ...tenant(),
        ipHash: input.ipHash === null ? null : Buffer.from(input.ipHash),
      });
    },
  };
  const outbox: EventRepository = {
    async pending(limit) {
      const rows = await tx
        .select()
        .from(events)
        .where(and(scope.where(events), isNull(events.dispatchedAt)))
        .orderBy(asc(events.createdAt), asc(events.id))
        .limit(scope.limit({ limit }))
        .for('update', { skipLocked: true });
      return rows.map((row) => eventRecordSchema.parse(row));
    },
    async insert(input) {
      await tx.insert(events).values({ ...input, ...tenant() });
    },
    async markDispatched(id, at) {
      requiredRow(
        await tx
          .update(events)
          .set({ dispatchedAt: at })
          .where(and(scope.where(events), eq(events.id, id)))
          .returning(),
        eventRecordSchema,
      );
    },
  };
  return { audit, events: outbox };
}
