import {
  FILE_SIZE_LIMITS,
  fileStatusSchema,
  type JsonValue,
  type FileScanResult,
} from '@backbricks/core';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  bytea,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
} from 'drizzle-orm/pg-core';

import { recordTimestamps, tenantProjectColumns, timestampColumn } from './columns.ts';
import { moduleInstances } from './instances.ts';
import { projectForeignKey } from './projects.ts';

export const fileStatus = pgEnum('file_status', fileStatusSchema.enum);

/** Private file metadata and durable cleanup identity; no raw upload token is stored. */
export const files = pgTable(
  'files',
  {
    id: text('id').primaryKey(),
    ...tenantProjectColumns(),
    instanceId: text('instance_id').notNull(),
    moduleType: text('module_type').notNull().default('uploads'),
    configVersion: integer('config_version').notNull(),
    status: fileStatus('status').notNull().default('pending'),
    stagingKey: text('staging_key').notNull().unique(),
    storageKey: text('storage_key').notNull().unique(),
    originalName: text('original_name').notNull(),
    declaredMime: text('declared_mime').notNull(),
    detectedMime: text('detected_mime'),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    sha256: bytea('sha256'),
    scan: jsonb('scan').$type<FileScanResult>(),
    scanAttempts: integer('scan_attempts').notNull().default(0),
    uploadTokenHash: bytea('upload_token_hash').notNull(),
    uploadExpiresAt: timestampColumn('upload_expires_at').notNull(),
    uploadedAt: timestampColumn('uploaded_at'),
    copiedAt: timestampColumn('copied_at'),
    stagingCleanedAt: timestampColumn('staging_cleaned_at'),
    storageCleanedAt: timestampColumn('storage_cleaned_at'),
    ownerType: text('owner_type'),
    ownerId: text('owner_id'),
    ownerExpiresAt: timestampColumn('owner_expires_at'),
    subjectEmail: text('subject_email'),
    metadata: jsonb('metadata').$type<Record<string, JsonValue>>().notNull().default({}),
    isTest: boolean('is_test').notNull().default(false),
    ...recordTimestamps(),
    expiresAt: timestampColumn('expires_at'),
    // Keep both object keys through retries and the last possible write to the old PUT URL.
    deletedAt: timestampColumn('deleted_at'),
    cleanupAfter: timestampColumn('cleanup_after'),
    cleanupAttempts: integer('cleanup_attempts').notNull().default(0),
  },
  (table) => [
    projectForeignKey(table),
    foreignKey({
      columns: [table.organizationId, table.projectId, table.instanceId, table.moduleType],
      foreignColumns: [
        moduleInstances.organizationId,
        moduleInstances.projectId,
        moduleInstances.id,
        moduleInstances.moduleType,
      ],
    }).onDelete('restrict'),
    check('files_uploads_parent', sql`${table.moduleType} = 'uploads'`),
    check('files_positive_version', sql`${table.configVersion} > 0`),
    check(
      'files_size_bounds',
      sql`${table.sizeBytes} between 1 and ${sql.raw(String(FILE_SIZE_LIMITS.maxSizeMb * FILE_SIZE_LIMITS.bytesPerMb))}`,
    ),
    check('files_name_bounds', sql`char_length(${table.originalName}) between 1 and 255`),
    check('files_token_hash_length', sql`octet_length(${table.uploadTokenHash}) = 32`),
    check(
      'files_sha256_length',
      sql`${table.sha256} is null or octet_length(${table.sha256}) = 32`,
    ),
    check(
      'files_staging_identity',
      sql`${table.stagingKey} = 'stg/' || ${table.organizationId} || '/' || ${table.projectId} || '/' || ${table.id}`,
    ),
    check(
      'files_final_identity',
      sql`${table.storageKey} = 'fil/' || ${table.organizationId} || '/' || ${table.projectId} || '/' || ${table.id}`,
    ),
    check(
      'files_owner_pair',
      sql`(${table.ownerType} is null and ${table.ownerId} is null) or (${table.ownerType} is not null and ${table.ownerId} is not null and length(${table.ownerType}) > 0 and length(${table.ownerId}) > 0)`,
    ),
    check(
      'files_subject_normalized',
      sql`${table.subjectEmail} is null or ${table.subjectEmail} = lower(${table.subjectEmail})`,
    ),
    check(
      'files_expiry_after_creation',
      sql`${table.expiresAt} is null or ${table.expiresAt} > ${table.createdAt}`,
    ),
    check(
      'files_unclaimed_expires',
      sql`${table.ownerId} is not null or ${table.expiresAt} is not null`,
    ),
    check(
      'files_owner_expiry_bound',
      sql`${table.ownerExpiresAt} is null or (${table.ownerId} is not null and ${table.expiresAt} is not null and ${table.expiresAt} <= ${table.ownerExpiresAt})`,
    ),
    check('files_put_expiry', sql`${table.uploadExpiresAt} > ${table.createdAt}`),
    check(
      'files_json_objects',
      sql`jsonb_typeof(${table.metadata}) = 'object' and (${table.scan} is null or jsonb_typeof(${table.scan}) = 'object')`,
    ),
    check(
      'files_attempts_nonnegative',
      sql`${table.scanAttempts} >= 0 and ${table.cleanupAttempts} >= 0`,
    ),
    check(
      'files_deletion_cleanup',
      sql`${table.deletedAt} is null or (${table.cleanupAfter} is not null and ${table.deletedAt} >= ${table.createdAt})`,
    ),
    check(
      'files_uploaded_state',
      sql`${table.status} not in ('uploaded', 'scanning', 'ready', 'quarantined') or ${table.uploadedAt} is not null`,
    ),
    check(
      'files_ready_inspected',
      sql`${table.status} <> 'ready' or (${table.detectedMime} is not null and ${table.sha256} is not null and ${table.scan} is not null)`,
    ),
    index('files_list_idx').on(
      table.organizationId,
      table.projectId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    index('files_zone_idx').on(
      table.organizationId,
      table.projectId,
      table.instanceId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    index('files_status_idx').on(
      table.organizationId,
      table.projectId,
      table.status,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    index('files_owner_idx')
      .on(table.organizationId, table.projectId, table.ownerType, table.ownerId)
      .where(sql`${table.ownerId} is not null`),
    index('files_orphan_idx')
      .on(table.organizationId, table.projectId, table.createdAt, table.id)
      .where(sql`${table.ownerId} is null`),
    index('files_expiry_idx')
      .on(table.organizationId, table.projectId, table.expiresAt, table.id)
      .where(sql`${table.expiresAt} is not null`),
    index('files_cleanup_idx')
      .on(table.organizationId, table.projectId, table.cleanupAfter, table.id)
      .where(sql`${table.deletedAt} is not null`),
  ],
);
