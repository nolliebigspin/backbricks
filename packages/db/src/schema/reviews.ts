import { reviewModerationStatusSchema, type PublicRequestSource } from '@backbricks/core';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  type AnyPgColumn,
  type ExtraConfigColumn,
} from 'drizzle-orm/pg-core';

import { recordTimestamps, tenantProjectColumns, timestampColumn } from './columns.ts';
import { spamVerdict } from './forms.ts';
import { moduleInstances } from './instances.ts';
import { projectForeignKey } from './projects.ts';

export const reviewModerationStatus = pgEnum(
  'review_moderation_status',
  reviewModerationStatusSchema.enum,
);

/** Published eligibility shared by the partial indexes and the tenant repository. */
export function reviewPublication(
  table: Record<'moderationStatus' | 'publishedAt' | 'isTest', AnyPgColumn | ExtraConfigColumn>,
) {
  return sql`${table.moderationStatus} = 'approved' and ${table.publishedAt} is not null and not ${table.isTest}`;
}

export const reviews = pgTable(
  'reviews',
  {
    id: text('id').primaryKey(),
    ...tenantProjectColumns(),
    instanceId: text('instance_id').notNull(),
    moduleType: text('module_type').notNull().default('reviews'),
    configVersion: integer('config_version').notNull(),
    rating: smallint('rating').notNull(),
    title: text('title'),
    body: text('body'),
    authorName: text('author_name').notNull(),
    subjectEmail: text('subject_email'),
    publicFields: jsonb('public_fields').$type<Record<string, string>>().notNull().default({}),
    privateFields: jsonb('private_fields').$type<Record<string, string>>().notNull().default({}),
    moderationStatus: reviewModerationStatus('moderation_status').notNull().default('pending'),
    publishedAt: timestampColumn('published_at'),
    moderatedBy: text('moderated_by'),
    moderatedAt: timestampColumn('moderated_at'),
    spamVerdict: spamVerdict('spam_verdict').notNull().default('clean'),
    isTest: boolean('is_test').notNull().default(false),
    source: jsonb('source').$type<PublicRequestSource>().notNull(),
    ...recordTimestamps(),
    expiresAt: timestampColumn('expires_at'),
  },
  (table) => {
    const tenant = [table.organizationId, table.projectId, table.instanceId] as const;
    return [
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
      check('reviews_module_type', sql`${table.moduleType} = 'reviews'`),
      check('reviews_rating', sql`${table.rating} between 1 and 10`),
      check('reviews_positive_version', sql`${table.configVersion} > 0`),
      check(
        'reviews_publication',
        sql`${table.publishedAt} is null or ${table.moderationStatus} = 'approved'`,
      ),
      check(
        'reviews_expiry_after_creation',
        sql`${table.expiresAt} is null or ${table.expiresAt} > ${table.createdAt}`,
      ),
      check(
        'reviews_spam_expires',
        sql`${table.spamVerdict} <> 'spam' or ${table.expiresAt} is not null`,
      ),
      check(
        'reviews_subject_normalized',
        sql`${table.subjectEmail} is null or ${table.subjectEmail} = lower(${table.subjectEmail})`,
      ),
      index('reviews_queue_idx').on(...tenant, table.createdAt.desc(), table.id.desc()),
      index('reviews_public_newest_idx')
        .on(...tenant, table.publishedAt.desc(), table.id.desc())
        .where(reviewPublication(table)),
      index('reviews_public_rating_asc_idx')
        .on(...tenant, table.rating.asc(), table.publishedAt.desc(), table.id.desc())
        .where(reviewPublication(table)),
      index('reviews_public_rating_desc_idx')
        .on(...tenant, table.rating.desc(), table.publishedAt.desc(), table.id.desc())
        .where(reviewPublication(table)),
      index('reviews_subject_idx')
        .on(table.organizationId, table.projectId, table.subjectEmail)
        .where(sql`${table.subjectEmail} is not null`),
      index('reviews_expiry_idx')
        .on(table.organizationId, table.projectId, table.expiresAt)
        .where(sql`${table.expiresAt} is not null`),
    ];
  },
);
