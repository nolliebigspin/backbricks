import { AppError, MAX_BULK_ITEMS, type RepositoryPage } from '@backbricks/core';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';

import type { DbTransaction } from '../client.ts';
import { reviewPublication, reviews as t } from '../schema/reviews.ts';
import { beforeCursor, withoutBoundValues, type RepositoryScope } from './scope.ts';

type Insert = Omit<typeof t.$inferInsert, 'organizationId' | 'projectId' | 'moduleType'>;
type Changes = Pick<
  Insert,
  'moderationStatus' | 'publishedAt' | 'moderatedBy' | 'moderatedAt' | 'updatedAt'
>;
type Sort = 'newest' | 'rating_asc' | 'rating_desc';
type Filter = NonNullable<Insert['moderationStatus']> | 'published' | 'to_review';
type Position = { rating: number; publishedAt: Date; id: string };
const live = (now: Date) => or(isNull(t.expiresAt), gt(t.expiresAt, now));

function publicationFilter(filter: Filter | undefined) {
  switch (filter) {
    case 'published':
      return isNotNull(t.publishedAt);
    case 'to_review':
      return and(
        isNull(t.publishedAt),
        or(eq(t.moderationStatus, 'pending'), eq(t.moderationStatus, 'approved')),
      );
    case 'approved':
      return and(eq(t.moderationStatus, filter), isNull(t.publishedAt));
    case undefined:
      return undefined;
    default:
      return eq(t.moderationStatus, filter);
  }
}

const counted = (filter: SQL | undefined) => sql`count(*) filter (where ${filter})`.mapWith(Number);

function publishedBefore(sort: Sort, before: Position | undefined) {
  if (!before) return undefined;
  const time = or(
    lt(t.publishedAt, before.publishedAt),
    and(eq(t.publishedAt, before.publishedAt), lt(t.id, before.id)),
  );
  if (sort === 'newest') return time;
  const rating = sort === 'rating_asc' ? gt(t.rating, before.rating) : lt(t.rating, before.rating);
  return or(rating, and(eq(t.rating, before.rating), time));
}

export function createReviewsRepository(tx: DbTransaction, scope: RepositoryScope) {
  const where = (...conditions: (SQL | undefined)[]) => {
    scope.project();
    return and(scope.where(t), ...conditions);
  };
  const publicWhere = (instanceId: string, now: Date, cursor?: SQL) =>
    where(eq(t.instanceId, instanceId), reviewPublication(t), live(now), cursor);

  async function deleteBatch(condition: SQL | undefined, limit: number) {
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_BULK_ITEMS)
      throw new AppError('invalid_request');
    const victims = tx
      .select({ id: t.id })
      .from(t)
      .where(condition)
      .orderBy(t.createdAt, t.id)
      .limit(limit)
      .for('update');
    const result = await tx.delete(t).where(where(inArray(t.id, victims)));
    return result.rowCount ?? 0;
  }

  return {
    async insert(input: Insert) {
      await withoutBoundValues(tx.insert(t).values({ ...input, ...scope.project() }));
    },
    async get(id: string, now: Date, lock = false) {
      const query = tx
        .select()
        .from(t)
        .where(where(eq(t.id, id), live(now)));
      const [row] = await (lock ? query.for('update') : query);
      if (!row) throw new AppError('not_found');
      return row;
    },
    list(instanceId: string, filter: Filter | undefined, now: Date, page: RepositoryPage) {
      return tx
        .select()
        .from(t)
        .where(
          where(
            eq(t.instanceId, instanceId),
            live(now),
            publicationFilter(filter),
            beforeCursor(t, page),
          ),
        )
        .orderBy(desc(t.createdAt), desc(t.id))
        .limit(scope.limit(page))
        .execute();
    },
    async patch(id: string, changes: Changes) {
      const result = await tx
        .update(t)
        .set(changes)
        .where(where(eq(t.id, id)));
      if (!result.rowCount) throw new AppError('not_found');
    },
    async delete(id: string) {
      const result = await tx.delete(t).where(where(eq(t.id, id)));
      if (!result.rowCount) throw new AppError('not_found');
    },
    async listPublished(
      instanceId: string,
      now: Date,
      sort: Sort,
      page: { limit: number; before?: Position },
    ) {
      const ratingOrder =
        sort === 'newest' ? [] : [sort === 'rating_asc' ? asc(t.rating) : desc(t.rating)];
      const rows = await tx
        .select({
          id: t.id,
          rating: t.rating,
          title: t.title,
          body: t.body,
          authorName: t.authorName,
          publicFields: t.publicFields,
          publishedAt: t.publishedAt,
        })
        .from(t)
        .where(publicWhere(instanceId, now, publishedBefore(sort, page.before)))
        .orderBy(...ratingOrder, desc(t.publishedAt), desc(t.id))
        .limit(scope.limit({ limit: page.limit, lookAhead: true }));
      return rows.flatMap((row) =>
        row.publishedAt ? [{ ...row, publishedAt: row.publishedAt }] : [],
      );
    },
    ratingCounts(instanceId: string, now: Date) {
      return tx
        .select({ rating: t.rating, count: count() })
        .from(t)
        .where(publicWhere(instanceId, now))
        .groupBy(t.rating)
        .execute();
    },
    async adminCounts(instanceId: string, now: Date) {
      const rows = await tx
        .select({
          rating: t.rating,
          pending: counted(publicationFilter('pending')),
          approved: counted(publicationFilter('approved')),
          published: counted(reviewPublication(t)),
          rejected: counted(publicationFilter('rejected')),
        })
        .from(t)
        .where(where(eq(t.instanceId, instanceId), live(now)))
        .groupBy(t.rating);
      const moderation = { pending: 0, approved: 0, published: 0, rejected: 0 };
      for (const row of rows) {
        moderation.pending += row.pending;
        moderation.approved += row.approved;
        moderation.published += row.published;
        moderation.rejected += row.rejected;
      }
      return {
        ratings: rows.map(({ rating, published }) => ({ rating, count: published })),
        moderation,
      };
    },
    purgeExpired(now: Date, limit: number) {
      return deleteBatch(where(lte(t.expiresAt, now)), limit);
    },
    async recomputeExpiry(instanceId: string, days: number | null, now: Date, spamDays: number) {
      const retention =
        days === null
          ? sql`null::timestamptz`
          : sql`${t.createdAt} + make_interval(days => ${days})`;
      const result = await tx
        .update(t)
        .set({
          expiresAt: sql`case when ${t.spamVerdict} = 'spam' then least(${retention}, ${t.createdAt} + make_interval(days => ${spamDays})) else ${retention} end`,
        })
        .where(where(eq(t.instanceId, instanceId), live(now)));
      return result.rowCount ?? 0;
    },
    findBySubject(email: string, page: RepositoryPage) {
      return withoutBoundValues(
        tx
          .select()
          .from(t)
          .where(where(eq(t.subjectEmail, email), beforeCursor(t, page)))
          .orderBy(desc(t.createdAt), desc(t.id))
          .limit(scope.limit(page)),
      );
    },
    deleteBySubject(email: string, limit: number) {
      return withoutBoundValues(deleteBatch(where(eq(t.subjectEmail, email)), limit));
    },
    eraseBatch(limit: number) {
      return deleteBatch(where(), limit);
    },
  };
}
