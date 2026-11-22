import { AppError, type ModulePublicRouter } from '@backbricks/core';
import { z } from 'zod';

import {
  REVIEW_LIMITS,
  REVIEW_SUBMISSION_EVENT,
  REVIEW_SUBMISSIONS_METRIC,
  REVIEW_SUBMIT_SCOPE,
} from './constants.ts';
import { reviewExpiry } from './lifecycle.ts';
import { reviewsRepository, type ReviewsRuntime } from './runtime.ts';
import { reviewCollectionParams, reviewIdSchema } from './schemas.ts';
import { reviewBodySchema } from './submission-schema.ts';
import { validateReview } from './validation.ts';

const reviewAcceptedSchema = z.object({ id: reviewIdSchema }).strict();

export function reviewsSubmissionRoute(router: ModulePublicRouter<ReviewsRuntime>) {
  router.register(
    {
      method: 'POST',
      path: '/{key}/reviews',
      operationId: 'reviews.public.submit',
      input: z.object({
        params: reviewCollectionParams,
        query: z.object({}).strict(),
        body: reviewBodySchema,
      }),
      responses: {
        200: {
          kind: 'json',
          description: 'The submitted review ID.',
          schema: reviewAcceptedSchema,
        },
      },
      policy: { kind: 'public', bodyLimitBytes: REVIEW_LIMITS.bodyBytes },
      access: {
        kind: 'write',
        secretScope: REVIEW_SUBMIT_SCOPE,
        idempotency: { status: 200 },
        quota: { metric: REVIEW_SUBMISSIONS_METRIC },
      },
    },
    async (runtime, { body }) => {
      const context = runtime.publicWrite;
      if (!context) throw new AppError('internal_error');
      const config = runtime.config(context.config);
      const data = validateReview(config, body);
      const id = runtime.services.ids.generate('rev');
      const now = runtime.services.clock.now();
      await reviewsRepository(runtime).insert({
        ...data,
        id,
        instanceId: context.instanceId,
        configVersion: context.configVersion,
        moderationStatus: 'pending',
        publishedAt: null,
        moderatedBy: null,
        moderatedAt: null,
        spamVerdict: context.spam.status,
        isTest: false,
        source: context.source,
        createdAt: now,
        updatedAt: now,
        expiresAt: reviewExpiry(config, now, context.spam.status),
      });
      await runtime.services.events.publish(runtime.tx, {
        type: REVIEW_SUBMISSION_EVENT,
        subjectType: 'review',
        subjectId: id,
        payload: {
          instanceId: context.instanceId,
          configVersion: context.configVersion,
          spam: context.spam.status,
          isTest: false,
        },
      });
      await runtime.services.usage.increment(runtime.tx, {
        metric: REVIEW_SUBMISSIONS_METRIC,
        delta: 1n,
      });
      return Response.json({ id });
    },
  );
}
