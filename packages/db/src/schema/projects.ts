import { sql } from 'drizzle-orm';
import {
  bytea,
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  unique,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

import { user } from './auth.generated.ts';
import {
  apiKeyKind,
  organizationIdColumn,
  recordTimestamps,
  tenantProjectColumns,
  timestampColumn,
} from './columns.ts';

export const projects = pgTable(
  'projects',
  {
    id: text('id').primaryKey(),
    organizationId: organizationIdColumn(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    allowedOrigins: text('allowed_origins').array().notNull().default([]),
    settings: jsonb('settings').$type<Record<string, unknown>>().notNull().default({}),
    ...recordTimestamps(),
    deletedAt: timestampColumn('deleted_at'),
    // Set when hard erasure finished (ADR-0061); the row stays as a tombstone for audit references.
    erasedAt: timestampColumn('erased_at'),
  },
  (table) => [
    unique().on(table.organizationId, table.slug),
    unique().on(table.organizationId, table.id),
    check(
      'projects_erased_after_archive',
      sql`${table.erasedAt} is null or ${table.deletedAt} is not null`,
    ),
  ],
);

/** A composite parent reference prevents valid IDs from different tenants being combined. */
export function projectForeignKey(table: { organizationId: AnyPgColumn; projectId: AnyPgColumn }) {
  return foreignKey({
    columns: [table.organizationId, table.projectId],
    foreignColumns: [projects.organizationId, projects.id],
  }).onDelete('cascade');
}

export const apiKeys = pgTable(
  'api_keys',
  {
    id: text('id').primaryKey(),
    ...tenantProjectColumns(),
    kind: apiKeyKind('kind').notNull(),
    name: text('name').notNull(),
    lookupHash: bytea('lookup_hash').notNull().unique(),
    displayPrefix: text('display_prefix').notNull(),
    publicToken: text('public_token').unique(),
    scopes: text('scopes').array().notNull().default([]),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    lastUsedAt: timestampColumn('last_used_at'),
    expiresAt: timestampColumn('expires_at'),
    revokedAt: timestampColumn('revoked_at'),
    createdAt: timestampColumn('created_at').notNull(),
  },
  (table) => [
    projectForeignKey(table),
    check(
      'api_keys_public_token_kind',
      sql`(${table.kind} = 'publishable') = (${table.publicToken} is not null)`,
    ),
    check('api_keys_hash_length', sql`octet_length(${table.lookupHash}) = 32`),
    index('api_keys_project_idx')
      .on(table.organizationId, table.projectId)
      .where(sql`${table.revokedAt} is null`),
  ],
);
