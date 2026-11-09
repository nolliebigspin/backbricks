import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  bytea,
  check,
  date,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
} from 'drizzle-orm/pg-core';

import {
  actorType,
  notificationChannel,
  organizationIdColumn,
  recordTimestamps,
  tenantProjectColumns,
  timestampColumn,
} from './columns.ts';
import { instanceForeignKey } from './instances.ts';
import { projectForeignKey } from './projects.ts';

export const events = pgTable(
  'events',
  {
    id: text('id').primaryKey(),
    organizationId: organizationIdColumn(),
    projectId: text('project_id'),
    type: text('type').notNull(),
    subjectType: text('subject_type'),
    subjectId: text('subject_id'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestampColumn('created_at').notNull(),
    dispatchedAt: timestampColumn('dispatched_at'),
    expiresAt: timestampColumn('expires_at').notNull(),
  },
  (table) => [
    projectForeignKey(table),
    index('events_pending_idx')
      .on(table.createdAt)
      .where(sql`${table.dispatchedAt} is null`),
    index('events_expiry_idx').on(table.expiresAt),
  ],
);

// The append-only trigger is hand-written SQL (migration 20261106024528_audit_immutability);
// schema-integrity.test.ts asserts it still exists.
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: text('id').primaryKey(),
    // Historical tenant references survive erasure without updating an append-only row.
    organizationId: text('organization_id').notNull(),
    projectId: text('project_id'),
    actorType: actorType('actor_type').notNull(),
    actorId: text('actor_id'),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    changes: jsonb('changes').$type<Record<string, unknown>>(),
    ipHash: bytea('ip_hash'),
    requestId: text('request_id'),
    createdAt: timestampColumn('created_at').notNull(),
    expiresAt: timestampColumn('expires_at').notNull(),
  },
  (table) => [
    index('audit_logs_org_idx').on(table.organizationId, table.createdAt),
    index('audit_logs_expiry_idx').on(table.expiresAt),
    check('audit_logs_expiry_after_creation', sql`${table.expiresAt} > ${table.createdAt}`),
  ],
);

export const notificationRules = pgTable(
  'notification_rules',
  {
    id: text('id').primaryKey(),
    ...tenantProjectColumns(),
    instanceId: text('instance_id'),
    eventType: text('event_type').notNull(),
    channel: notificationChannel('channel').notNull().default('email'),
    recipients: text('recipients').array().notNull(),
    includeContent: boolean('include_content').notNull().default(false),
    enabled: boolean('enabled').notNull().default(true),
    ...recordTimestamps(),
  },
  (table) => [projectForeignKey(table), instanceForeignKey(table)],
);

export const usageCounters = pgTable(
  'usage_counters',
  {
    ...tenantProjectColumns(),
    metric: text('metric').notNull(),
    period: date('period').notNull(),
    value: bigint('value', { mode: 'bigint' }).notNull().default(0n),
  },
  (table) => [
    projectForeignKey(table),
    primaryKey({ columns: [table.organizationId, table.projectId, table.metric, table.period] }),
    check('usage_counters_nonnegative', sql`${table.value} >= 0`),
    check('usage_counters_month_start', sql`extract(day from ${table.period}) = 1`),
  ],
);
