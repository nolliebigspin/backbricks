import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  text,
  unique,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

import {
  actorType,
  moduleInstanceStatus,
  recordTimestamps,
  tenantProjectColumns,
  timestampColumn,
} from './columns.ts';
import { projectForeignKey } from './projects.ts';

export const moduleInstances = pgTable(
  'module_instances',
  {
    id: text('id').primaryKey(),
    ...tenantProjectColumns(),
    moduleType: text('module_type').notNull(),
    key: text('key').notNull(),
    name: text('name').notNull(),
    status: moduleInstanceStatus('status').notNull().default('active'),
    config: jsonb('config').$type<unknown>().notNull(),
    configVersion: integer('config_version').notNull().default(1),
    moduleVersion: integer('module_version').notNull(),
    ...recordTimestamps(),
  },
  (table) => [
    projectForeignKey(table),
    unique().on(table.organizationId, table.projectId, table.id),
    unique().on(table.projectId, table.moduleType, table.key),
    check('module_instances_key_format', sql`${table.key} ~ '^[a-z0-9][a-z0-9-]{0,62}$'`),
    check(
      'module_instances_positive_versions',
      sql`${table.configVersion} > 0 and ${table.moduleVersion} > 0`,
    ),
  ],
);

export function instanceForeignKey(table: {
  organizationId: AnyPgColumn;
  projectId: AnyPgColumn;
  instanceId: AnyPgColumn;
}) {
  return foreignKey({
    columns: [table.organizationId, table.projectId, table.instanceId],
    foreignColumns: [moduleInstances.organizationId, moduleInstances.projectId, moduleInstances.id],
  }).onDelete('cascade');
}

export const moduleInstanceRevisions = pgTable(
  'module_instance_revisions',
  {
    id: text('id').primaryKey(),
    ...tenantProjectColumns(),
    instanceId: text('instance_id').notNull(),
    configVersion: integer('config_version').notNull(),
    config: jsonb('config').$type<unknown>().notNull(),
    moduleVersion: integer('module_version').notNull(),
    actorType: actorType('actor_type').notNull(),
    actorId: text('actor_id'),
    createdAt: timestampColumn('created_at').notNull(),
  },
  (table) => [
    projectForeignKey(table),
    instanceForeignKey(table),
    unique().on(table.instanceId, table.configVersion),
    check(
      'module_instance_revisions_positive_versions',
      sql`${table.configVersion} > 0 and ${table.moduleVersion} > 0`,
    ),
  ],
);
