import type { spamVerdictSchema } from '@backbricks/core';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
} from 'drizzle-orm/pg-core';
import type { z } from 'zod';

import { recordTimestamps, tenantProjectColumns, timestampColumn } from './columns.ts';
import { instanceForeignKey } from './instances.ts';
import { projectForeignKey } from './projects.ts';

/** Spam verdict values come from the shared guard (D44); a test checks they match core's list. */
export const SPAM_VERDICTS = ['clean', 'suspect', 'spam'] as const satisfies readonly z.infer<
  typeof spamVerdictSchema
>['status'][];
export const spamVerdict = pgEnum('spam_verdict', SPAM_VERDICTS);
/** Values mirror the forms repository interface; the server composition typecheck ties them. */
export const formSubmissionStatus = pgEnum('form_submission_status', ['open', 'done']);
const tsvector = customType<{ data: string }>({ dataType: () => 'tsvector' });

/** Forms entries (docs/modules/forms.md §3). Personal data: `data`, `subject_email`, `source`. */
export const formSubmissions = pgTable(
  'form_submissions',
  {
    id: text('id').primaryKey(),
    ...tenantProjectColumns(),
    instanceId: text('instance_id').notNull(),
    configVersion: integer('config_version').notNull(),
    data: jsonb('data').$type<Record<string, unknown>>().notNull(),
    status: formSubmissionStatus('status').notNull().default('open'),
    readAt: timestampColumn('read_at'),
    spamVerdict: spamVerdict('spam_verdict').notNull().default('clean'),
    spamReasons: text('spam_reasons')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    isTest: boolean('is_test').notNull().default(false),
    subjectEmail: text('subject_email'),
    source: jsonb('source').$type<Record<string, unknown>>().notNull().default({}),
    // Computed on insert from module-extracted text (`simple` configuration, D45).
    searchVector: tsvector('search_vector').notNull(),
    ...recordTimestamps(),
    expiresAt: timestampColumn('expires_at'),
  },
  (table) => [
    projectForeignKey(table),
    instanceForeignKey(table),
    check('form_submissions_positive_version', sql`${table.configVersion} > 0`),
    check(
      'form_submissions_expiry_after_creation',
      sql`${table.expiresAt} is null or ${table.expiresAt} > ${table.createdAt}`,
    ),
    // Spam is always auto-deleted (§F.4), even when retention is unlimited.
    check(
      'form_submissions_spam_expires',
      sql`${table.spamVerdict} <> 'spam' or ${table.expiresAt} is not null`,
    ),
    check(
      'form_submissions_subject_normalized',
      sql`${table.subjectEmail} is null or ${table.subjectEmail} = lower(${table.subjectEmail})`,
    ),
    index('form_submissions_list_idx').on(
      table.organizationId,
      table.projectId,
      table.instanceId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    index('form_submissions_search_idx').using('gin', table.searchVector),
    index('form_submissions_subject_idx')
      .on(table.organizationId, table.projectId, table.subjectEmail)
      .where(sql`${table.subjectEmail} is not null`),
    index('form_submissions_expiry_idx')
      .on(table.organizationId, table.projectId, table.expiresAt)
      .where(sql`${table.expiresAt} is not null`),
  ],
);
