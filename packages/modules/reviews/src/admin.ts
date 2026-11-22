import {
  AppError,
  instanceKeySchema,
  pageQuerySchema,
  pageResult,
  principalActor,
  repositoryPage,
  type ModuleAdminRouter,
} from '@backbricks/core';
import { z } from 'zod';

import { ratingStats } from './read.ts';
import { reviewFilterSchema, type ReviewChange, type ReviewRecord } from './repository.ts';
import { reviewsRepository, type ReviewsRuntime } from './runtime.ts';
import {
  moderationCountsSchema,
  publicStatsSchema,
  reviewCollectionParams,
  reviewDetailSchema,
  reviewIdParams,
  reviewSummarySchema,
} from './schemas.ts';

const noQuery = z.object({}).strict();
const itemRead = z.object({ params: reviewIdParams, query: noQuery, body: z.null() });
const collectionQuery = pageQuerySchema
  .extend({ collection: instanceKeySchema, status: reviewFilterSchema.optional() })
  .strict();
const moderationResultSchema = reviewSummarySchema.pick({
  id: true,
  moderationStatus: true,
  publishedAt: true,
});
function moderationResult(row: ReviewRecord) {
  return {
    id: row.id,
    moderationStatus: row.moderationStatus,
    publishedAt: row.publishedAt?.toISOString() ?? null,
  };
}
const actionSchema = z.enum(['approve', 'reject', 'publish', 'unpublish']);
type Action = z.output<typeof actionSchema>;

const management = (
  operation: string,
  scope: 'data:read' | 'data:write' | 'data:delete' | 'stats:read',
) => ({
  kind: 'management' as const,
  bodyLimitBytes: 1024,
  session: { role: 'member' as const },
  secretKey: { scope },
  isolationCase: `reviews.${operation}`,
});

function summary(row: ReviewRecord) {
  return {
    id: row.id,
    collectionId: row.instanceId,
    rating: row.rating,
    title: row.title,
    body: row.body,
    authorName: row.authorName,
    moderationStatus: row.moderationStatus,
    isTest: row.isTest,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function detail(row: ReviewRecord) {
  return {
    ...summary(row),
    email: row.subjectEmail,
    publicFields: row.publicFields,
    privateFields: row.privateFields,
    spamVerdict: row.spamVerdict,
    moderatedAt: row.moderatedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
  };
}

function transition(
  row: ReviewRecord,
  action: Action,
  now: Date,
  actorId: string | null,
): ReviewChange | null {
  const current = {
    moderationStatus: row.moderationStatus,
    publishedAt: row.publishedAt,
    moderatedBy: row.moderatedBy,
    moderatedAt: row.moderatedAt,
    updatedAt: now,
  };
  switch (action) {
    case 'approve':
      return row.moderationStatus === 'approved'
        ? null
        : { ...current, moderationStatus: 'approved', moderatedBy: actorId, moderatedAt: now };
    case 'reject':
      return row.moderationStatus === 'rejected'
        ? null
        : {
            ...current,
            moderationStatus: 'rejected',
            publishedAt: null,
            moderatedBy: actorId,
            moderatedAt: now,
          };
    case 'publish':
      if (row.moderationStatus !== 'approved' || row.isTest)
        throw new AppError('conflict', {
          detail: 'Publishing requires an approved review from a real submission.',
        });
      return row.publishedAt ? null : { ...current, publishedAt: now };
    case 'unpublish':
      return row.publishedAt ? { ...current, publishedAt: null } : null;
    default:
      throw new AppError('internal_error');
  }
}

export function reviewsAdminRoutes(router: ModuleAdminRouter<ReviewsRuntime>) {
  router.register(
    {
      method: 'GET',
      resource: 'reviews',
      path: '/',
      operationId: 'reviews.records.list',
      input: z.object({ params: noQuery, query: collectionQuery, body: z.null() }),
      responses: {
        200: {
          kind: 'json',
          description: 'Private queue for a review collection.',
          schema: z
            .object({ data: z.array(reviewSummarySchema), nextCursor: z.string().nullable() })
            .strict(),
        },
      },
      policy: management('records.list', 'data:read'),
    },
    async (runtime, { query }) => {
      const instance = await runtime.instances.get(query.collection);
      const rows = await reviewsRepository(runtime).list(
        instance.id,
        query.status,
        runtime.services.clock.now(),
        repositoryPage(query),
      );
      const { data, nextCursor } = pageResult(rows, query.limit);
      return Response.json({ data: data.map(summary), nextCursor });
    },
  );

  router.register(
    {
      method: 'GET',
      resource: 'reviews',
      path: '/{id}',
      operationId: 'reviews.records.read',
      input: itemRead,
      responses: {
        200: { kind: 'json', description: 'Private review detail.', schema: reviewDetailSchema },
      },
      policy: management('records.read', 'data:read'),
    },
    async (runtime, { params }) =>
      Response.json(
        detail(await reviewsRepository(runtime).get(params.id, runtime.services.clock.now())),
      ),
  );

  router.register(
    {
      method: 'PATCH',
      resource: 'reviews',
      path: '/{id}',
      operationId: 'reviews.records.moderate',
      input: itemRead.extend({ body: z.object({ action: actionSchema }).strict() }),
      responses: {
        200: {
          kind: 'json',
          description: 'Current state of the review after moderation.',
          schema: moderationResultSchema,
        },
      },
      policy: management('records.moderate', 'data:write'),
    },
    async (runtime, { params, body }) => {
      const principal = runtime.tx.context.principal;
      if (!principal) throw new AppError('forbidden');
      const actor = principalActor(principal);
      const repo = reviewsRepository(runtime);
      const now = runtime.services.clock.now();
      const row = await repo.get(params.id, now, true);
      const changes = transition(row, body.action, now, actor.actorId ?? null);
      if (!changes) return Response.json(moderationResult(row));
      await repo.patch(row.id, changes);
      await runtime.services.audit.record(runtime.tx, {
        ...actor,
        action: `review.${body.action}`,
        targetType: 'review',
        targetId: row.id,
        changes: { status: changes.moderationStatus },
      });
      return Response.json(moderationResult({ ...row, ...changes }));
    },
  );

  router.register(
    {
      method: 'DELETE',
      resource: 'reviews',
      path: '/{id}',
      operationId: 'reviews.records.delete',
      input: itemRead,
      responses: { 204: { kind: 'empty', description: 'The review was permanently deleted.' } },
      policy: management('records.delete', 'data:delete'),
    },
    async (runtime, { params }) => {
      const principal = runtime.tx.context.principal;
      if (!principal) throw new AppError('forbidden');
      await reviewsRepository(runtime).delete(params.id);
      await runtime.services.audit.record(runtime.tx, {
        ...principalActor(principal),
        action: 'review.deleted',
        targetType: 'review',
        targetId: params.id,
      });
      return new Response(null, { status: 204 });
    },
  );

  router.register(
    {
      method: 'GET',
      path: '/{key}/stats',
      operationId: 'reviews.collection.stats',
      input: z.object({ params: reviewCollectionParams, query: noQuery, body: z.null() }),
      responses: {
        200: {
          kind: 'json',
          description: 'Published statistics and moderation counts.',
          schema: publicStatsSchema.extend({ moderation: moderationCountsSchema }).strict(),
        },
      },
      policy: management('collection.stats', 'stats:read'),
    },
    async (runtime, { params }) => {
      const instance = await runtime.instances.get(params.key);
      const repo = reviewsRepository(runtime);
      const now = runtime.services.clock.now();
      const { ratings, moderation } = await repo.adminCounts(instance.id, now);
      return Response.json({ ...ratingStats(instance.config.ratingScale, ratings), moderation });
    },
  );
}
