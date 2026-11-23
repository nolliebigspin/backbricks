import {
  AppError,
  decodePagePosition,
  encodePagePosition,
  moduleInstanceSchema,
  pageQuerySchema,
  type ModulePublicRouter,
} from '@backbricks/core';
import { z } from 'zod';

import type { ReviewsConfig } from './config.ts';
import { REVIEW_LIMITS } from './constants.ts';
import { reviewSortSchema, type PublicReviewRow } from './repository.ts';
import { reviewsRepository, type ReviewsRuntime } from './runtime.ts';
import {
  publicReviewSchema,
  publicStatsSchema,
  reviewCollectionParams,
  reviewIdSchema,
} from './schemas.ts';

const readPolicy = { kind: 'public', bodyLimitBytes: 1024 } as const;
const readAccess = { kind: 'read' } as const;
const cacheHeaders = { 'Cache-Control': 'public, no-cache' };
const notModified = {
  kind: 'empty',
  description: 'The current public representation matches the validator.',
} as const;
const querySchema = pageQuerySchema
  .extend({
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(REVIEW_LIMITS.publicPage)
      .default(REVIEW_LIMITS.publicPage),
    sort: reviewSortSchema.default('newest'),
  })
  .strict();
const positionSchema = z
  .object({
    instanceId: moduleInstanceSchema.shape.id,
    sort: reviewSortSchema,
    rating: z.number().int().min(REVIEW_LIMITS.ratingMin).max(REVIEW_LIMITS.scaleMax),
    publishedAt: z.iso.datetime(),
    id: reviewIdSchema,
  })
  .strict();
const responsePage = z
  .object({ data: z.array(publicReviewSchema), nextCursor: z.string().nullable() })
  .strict();

const initial = (part: string) => `${Array.from(part)[0] ?? ''}.`;

function authorDisplay(name: string, format: ReviewsConfig['authorDisplay']) {
  const parts = name.split(/\s+/u);
  const first = parts[0] ?? '';
  const last = parts.length > 1 ? parts.at(-1) : undefined;
  if (format === 'initials') return last ? `${initial(first)} ${initial(last)}` : initial(first);
  return last ? `${first} ${initial(last)}` : first;
}

export function publicReview(row: PublicReviewRow, config: ReviewsConfig) {
  const fields = Object.fromEntries(
    config.fields.flatMap(({ key, public: visible }) => {
      const value = Object.hasOwn(row.publicFields, key) ? row.publicFields[key] : undefined;
      return visible && value !== undefined ? [[key, value]] : [];
    }),
  );
  return {
    id: row.id,
    rating: row.rating,
    title: row.title,
    body: row.body,
    displayName: authorDisplay(row.authorName, config.authorDisplay),
    fields,
    publishedAt: row.publishedAt.toISOString(),
  };
}

export function ratingStats(
  ratingScale: number,
  rows: ReadonlyArray<{ rating: number; count: number }>,
) {
  const counts = new Map(rows.map(({ rating, count }) => [rating, count]));
  const distribution = Array.from({ length: ratingScale }, (_, index) => ({
    rating: index + 1,
    count: counts.get(index + 1) ?? 0,
  }));
  const count = distribution.reduce((sum, bucket) => sum + bucket.count, 0);
  const total = distribution.reduce((sum, bucket) => sum + bucket.rating * bucket.count, 0);
  return {
    ratingScale,
    count,
    average: count ? Math.round((100 * total) / count) / 100 : null,
    distribution,
  };
}

async function currentCollection(runtime: ReviewsRuntime, key: string) {
  const collection = await runtime.instances.get(key);
  if (collection.status !== 'active') throw new AppError('not_found');
  return collection;
}

export function reviewsReadRoutes(router: ModulePublicRouter<ReviewsRuntime>) {
  router.register(
    {
      method: 'GET',
      path: '/{key}/reviews',
      operationId: 'reviews.public.list',
      input: z.object({ params: reviewCollectionParams, query: querySchema, body: z.null() }),
      responses: {
        200: { kind: 'json', description: 'A page of published reviews.', schema: responsePage },
        304: notModified,
      },
      policy: readPolicy,
      access: readAccess,
    },
    async (runtime, { params, query }) => {
      const collection = await currentCollection(runtime, params.key);
      const position = query.cursor ? decodePagePosition(query.cursor, positionSchema) : undefined;
      if (position && (position.instanceId !== collection.id || position.sort !== query.sort))
        throw new AppError('validation_failed', {
          detail: 'Use the cursor with its original collection and sort.',
        });
      const rows = await reviewsRepository(runtime).listPublished(
        collection.id,
        runtime.services.clock.now(),
        query.sort,
        {
          limit: query.limit,
          before: position && {
            id: position.id,
            publishedAt: new Date(position.publishedAt),
            rating: position.rating,
          },
        },
      );
      // A newer config can withdraw permission to show fields from reviews fetched above.
      const confirmed = await currentCollection(runtime, params.key);
      if (confirmed.id !== collection.id || confirmed.configVersion !== collection.configVersion)
        throw new AppError('conflict', {
          detail: 'The review collection changed during the read. Try again.',
        });
      const page = rows.slice(0, query.limit);
      const last = page.at(-1);
      return Response.json(
        {
          data: page.map((row) => publicReview(row, collection.config)),
          nextCursor:
            last && rows.length > query.limit
              ? encodePagePosition({
                  instanceId: collection.id,
                  sort: query.sort,
                  id: last.id,
                  rating: last.rating,
                  publishedAt: last.publishedAt.toISOString(),
                })
              : null,
        },
        { headers: cacheHeaders },
      );
    },
  );
  router.register(
    {
      method: 'GET',
      path: '/{key}/stats',
      operationId: 'reviews.public.stats',
      input: z.object({
        params: reviewCollectionParams,
        query: z.object({}).strict(),
        body: z.null(),
      }),
      responses: {
        200: {
          kind: 'json',
          description: 'Statistics for published reviews.',
          schema: publicStatsSchema,
        },
        304: notModified,
      },
      policy: readPolicy,
      access: readAccess,
    },
    async (runtime, { params }) => {
      const collection = await currentCollection(runtime, params.key);
      const rows = await reviewsRepository(runtime).ratingCounts(
        collection.id,
        runtime.services.clock.now(),
      );
      return Response.json(ratingStats(collection.config.ratingScale, rows), {
        headers: cacheHeaders,
      });
    },
  );
}
