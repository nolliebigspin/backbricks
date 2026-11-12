import {
  AppError,
  MAX_BULK_ITEMS as MAX_BULK,
  type JsonValue,
  type RepositoryPage,
} from '@backbricks/core';
import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  sql,
  type SQL,
} from 'drizzle-orm';

import type { DbTransaction } from '../client.ts';
import { formSubmissions } from '../schema/forms.ts';
import { beforeCursor, type RepositoryScope } from './scope.ts';

type Row = typeof formSubmissions.$inferSelect;
type Status = Row['status'];
type Verdict = Row['spamVerdict'];
type Source = Readonly<{ origin?: string; path?: string; uaFamily: string; ipHash?: string }>;
export type FormSubmissionRow = Readonly<{
  id: string;
  organizationId: string;
  projectId: string;
  instanceId: string;
  configVersion: number;
  data: Readonly<Record<string, JsonValue>>;
  status: Status;
  readAt: Date | null;
  spamVerdict: Verdict;
  spamReasons: readonly string[];
  isTest: boolean;
  subjectEmail: string | null;
  source: Source;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date | null;
}>;
type Changes = Partial<
  Pick<FormSubmissionRow, 'status' | 'readAt' | 'spamVerdict' | 'expiresAt'>
> & {
  updatedAt: Date;
};
type Filters = Readonly<{
  status?: Status;
  read?: boolean;
  folder?: 'inbox' | 'spam';
  isTest?: boolean;
  from?: Date;
  to?: Date;
  query?: string;
}>;
const MAX_BATCH = 1000;

// Stored values were validated by the module before insert; rows map back without re-validation.
function record(row: Row): FormSubmissionRow {
  return {
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    instanceId: row.instanceId,
    configVersion: row.configVersion,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- jsonb written from validated JSON.
    data: row.data as Record<string, JsonValue>,
    status: row.status,
    readAt: row.readAt,
    spamVerdict: row.spamVerdict,
    spamReasons: row.spamReasons,
    isTest: row.isTest,
    subjectEmail: row.subjectEmail,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- jsonb written from a minimized source.
    source: row.source as Source,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    expiresAt: row.expiresAt,
  };
}
function bounded(limit: number, max: number) {
  if (!Number.isInteger(limit) || limit < 1 || limit > max)
    throw new Error(`Batch size must be between 1 and ${max}.`);
  return limit;
}

/** Thin, tenant-scoped storage for forms entries (ADR-0055); forms logic stays in the module. */
export function createFormsRepository(tx: DbTransaction, scope: RepositoryScope) {
  const t = formSubmissions;
  const inForm = (instanceId: string, ...conditions: (SQL | undefined)[]) =>
    and(scope.where(t), eq(t.instanceId, instanceId), ...conditions);
  async function ensureAll(instanceId: string, ids: readonly string[]) {
    if (ids.length === 0 || ids.length > MAX_BULK || new Set(ids).size !== ids.length)
      throw new AppError('invalid_request', { detail: `Use 1–${MAX_BULK} distinct IDs.` });
    // Lock the rows so concurrent bulk edits serialize; any foreign/missing ID fails the whole call.
    const rows = await tx
      .select({ id: t.id })
      .from(t)
      .where(inForm(instanceId, inArray(t.id, [...ids])))
      .orderBy(t.id)
      .for('update');
    if (rows.length !== ids.length) throw new AppError('not_found');
  }
  async function deleteIds(where: SQL | undefined, limit: number) {
    const victims = tx
      .select({ id: t.id })
      .from(t)
      .where(where)
      .orderBy(t.createdAt, t.id)
      .limit(limit)
      .for('update', { skipLocked: true });
    const rows = await tx
      .delete(t)
      .where(and(scope.where(t), inArray(t.id, victims)))
      .returning({ id: t.id });
    return rows.map((row) => row.id);
  }
  return {
    async insert(
      input: Omit<FormSubmissionRow, 'organizationId' | 'projectId'> & { searchText: string },
    ) {
      const { searchText, ...values } = input;
      const [row] = await tx
        .insert(t)
        .values({
          ...values,
          ...scope.project(),
          spamReasons: [...values.spamReasons],
          searchVector: sql`to_tsvector('simple', ${searchText})`,
        })
        .returning();
      if (!row) throw new Error('Insert returned no row.');
      return record(row);
    },
    async list(instanceId: string, filters: Filters, page: RepositoryPage) {
      const rows = await tx
        .select()
        .from(t)
        .where(
          inForm(
            instanceId,
            filters.status ? eq(t.status, filters.status) : undefined,
            filters.read === undefined
              ? undefined
              : filters.read
                ? isNotNull(t.readAt)
                : isNull(t.readAt),
            filters.folder === 'spam'
              ? eq(t.spamVerdict, 'spam')
              : filters.folder === 'inbox'
                ? ne(t.spamVerdict, 'spam')
                : undefined,
            filters.isTest === undefined ? undefined : eq(t.isTest, filters.isTest),
            filters.from ? gte(t.createdAt, filters.from) : undefined,
            filters.to ? lte(t.createdAt, filters.to) : undefined,
            filters.query
              ? sql`${t.searchVector} @@ websearch_to_tsquery('simple', ${filters.query})`
              : undefined,
            beforeCursor(t, page),
          ),
        )
        .orderBy(desc(t.createdAt), desc(t.id))
        .limit(scope.limit(page));
      return rows.map(record);
    },
    async get(instanceId: string, id: string, options: { lock?: boolean } = {}) {
      const query = tx
        .select()
        .from(t)
        .where(inForm(instanceId, eq(t.id, id)));
      const [row] = await (options.lock ? query.for('update') : query);
      if (!row) throw new AppError('not_found');
      return record(row);
    },
    async patch(instanceId: string, id: string, changes: Changes) {
      const [row] = await tx
        .update(t)
        .set(changes)
        .where(inForm(instanceId, eq(t.id, id)))
        .returning();
      if (!row) throw new AppError('not_found');
      return record(row);
    },
    async delete(instanceId: string, id: string) {
      const rows = await tx
        .delete(t)
        .where(inForm(instanceId, eq(t.id, id)))
        .returning({ id: t.id });
      if (rows.length === 0) throw new AppError('not_found');
    },
    async bulkPatch(instanceId: string, ids: readonly string[], changes: Changes) {
      await ensureAll(instanceId, ids);
      const rows = await tx
        .update(t)
        .set(changes)
        .where(inForm(instanceId, inArray(t.id, [...ids])))
        .returning({ id: t.id });
      return rows.length;
    },
    async bulkDelete(instanceId: string, ids: readonly string[]) {
      await ensureAll(instanceId, ids);
      const rows = await tx
        .delete(t)
        .where(inForm(instanceId, inArray(t.id, [...ids])))
        .returning({ id: t.id });
      return rows.length;
    },
    deleteBatch(instanceId: string, limit: number) {
      return deleteIds(inForm(instanceId), bounded(limit, MAX_BATCH));
    },
    async counts(instanceId: string) {
      const [row] = await tx
        .select({
          total: sql<number>`count(*)::int`,
          unread: sql<number>`(count(*) filter (where ${t.readAt} is null and ${t.spamVerdict} <> 'spam'))::int`,
          spam: sql<number>`(count(*) filter (where ${t.spamVerdict} = 'spam'))::int`,
        })
        .from(t)
        .where(inForm(instanceId));
      return { total: row?.total ?? 0, unread: row?.unread ?? 0, spam: row?.spam ?? 0 };
    },
    async purgeExpired(now: Date, limit: number) {
      scope.project();
      const ids = await deleteIds(
        and(scope.where(t), isNotNull(t.expiresAt), lte(t.expiresAt, now)),
        bounded(limit, MAX_BATCH),
      );
      return ids.length;
    },
    async recomputeExpiry(instanceId: string, retentionDays: number | null) {
      const retention =
        retentionDays === null
          ? sql`null::timestamptz`
          : sql`${t.createdAt} + make_interval(days => ${retentionDays})`;
      // Spam keeps its earlier cap: least() ignores nulls, so unlimited retention leaves it as is.
      const rows = await tx
        .update(t)
        .set({
          expiresAt: sql`case when ${t.spamVerdict} = 'spam' then least(${t.expiresAt}, ${retention}) else ${retention} end`,
        })
        .where(inForm(instanceId))
        .returning({ id: t.id });
      return rows.length;
    },
    async findBySubject(email: string, page: RepositoryPage) {
      const rows = await tx
        .select()
        .from(t)
        .where(and(scope.where(t), eq(t.subjectEmail, email), beforeCursor(t, page)))
        .orderBy(desc(t.createdAt), desc(t.id))
        .limit(scope.limit(page));
      return rows.map(record);
    },
    deleteBySubject(email: string, limit: number) {
      scope.project();
      return deleteIds(and(scope.where(t), eq(t.subjectEmail, email)), bounded(limit, MAX_BATCH));
    },
    eraseBatch(limit: number) {
      scope.project();
      return deleteIds(scope.where(t), bounded(limit, MAX_BATCH));
    },
  };
}
