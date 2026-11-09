import { sql } from 'drizzle-orm';
import {
  bytea,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
} from 'drizzle-orm/pg-core';

import { tenantProjectColumns, timestampColumn } from './columns.ts';
import { projectForeignKey } from './projects.ts';

export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    ...tenantProjectColumns(),
    key: text('key').notNull(),
    requestHash: bytea('request_hash').notNull(),
    responseStatus: integer('response_status').notNull(),
    responseBody: jsonb('response_body').$type<unknown>().notNull(),
    createdAt: timestampColumn('created_at').notNull(),
    expiresAt: timestampColumn('expires_at').notNull(),
  },
  (table) => [
    projectForeignKey(table),
    primaryKey({ columns: [table.organizationId, table.projectId, table.key] }),
    index('idempotency_keys_expiry_idx').on(table.expiresAt),
    check('idempotency_keys_hash_length', sql`octet_length(${table.requestHash}) = 32`),
    check('idempotency_keys_response_status', sql`${table.responseStatus} between 200 and 299`),
    check('idempotency_keys_expiry_after_creation', sql`${table.expiresAt} > ${table.createdAt}`),
  ],
);

// Global technical tables contain no tenant records. Bucket identifiers contain hashed identities.
// UNLOGGED storage is hand-written SQL (migration 20261106024528_audit_immutability), asserted in schema-integrity.test.ts.
export const rateLimitBuckets = pgTable(
  'rate_limit_buckets',
  {
    bucket: text('bucket').primaryKey(),
    count: integer('count').notNull(),
    windowStart: timestampColumn('window_start').notNull(),
    expiresAt: timestampColumn('expires_at').notNull(),
  },
  (table) => [
    index('rate_limit_buckets_expiry_idx').on(table.expiresAt),
    check('rate_limit_buckets_positive_count', sql`${table.count} > 0`),
  ],
);

export const powChallengesUsed = pgTable(
  'pow_challenges_used',
  {
    signature: text('signature').primaryKey(),
    expiresAt: timestampColumn('expires_at').notNull(),
  },
  (table) => [index('pow_challenges_used_expiry_idx').on(table.expiresAt)],
);

export const authTokenReplays = pgTable(
  'auth_token_replays',
  {
    digest: text('digest').primaryKey(),
    expiresAt: timestampColumn('expires_at').notNull(),
  },
  (table) => [
    index('auth_token_replays_expiry_idx').on(table.expiresAt),
    check('auth_token_replays_digest', sql`${table.digest} ~ '^[a-f0-9]{64}$'`),
  ],
);

export const systemSettings = pgTable('system_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').$type<unknown>().notNull(),
  updatedAt: timestampColumn('updated_at').notNull(),
});
