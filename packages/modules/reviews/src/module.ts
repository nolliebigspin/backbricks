import { defineModule, SPAM_RETENTION_DAYS } from '@backbricks/core';

import { reviewsAdminRoutes } from './admin.ts';
import { reviewsConfigSchema, reviewsPublicWritePolicy } from './config.ts';
import {
  classifyReviewsChange,
  defaultReviewsConfig,
  reviewsCodegen,
  reviewTemplates,
} from './configuration.ts';
import {
  REVIEW_SUBMISSION_EVENT,
  REVIEW_SUBMISSIONS_METRIC,
  REVIEW_SUBMIT_SCOPE,
} from './constants.ts';
import { reviewPrivacy } from './lifecycle.ts';
import { reviewsSubmissionRoute } from './public.ts';
import { reviewsReadRoutes } from './read.ts';
import { reviewsRepository } from './runtime.ts';

export const reviewsModule = defineModule({
  type: 'reviews',
  moduleVersion: 1,
  displayName: { en: 'Reviews', de: 'Bewertungen' },
  resourceName: { singular: 'review-collection', plural: 'review-collections' },
  resourceNamespaces: ['reviews'],
  infrastructure: [],
  configSchema: reviewsConfigSchema,
  defaultConfig: defaultReviewsConfig,
  templates: reviewTemplates,
  validateConfigChange: classifyReviewsChange,
  codegen: reviewsCodegen,
  publicWritePolicy: reviewsPublicWritePolicy,
  scopes: [
    {
      name: REVIEW_SUBMIT_SCOPE,
      description: { en: 'Submit reviews from a server', de: 'Bewertungen vom Server senden' },
    },
  ],
  events: [
    {
      name: REVIEW_SUBMISSION_EVENT,
      description: { en: 'A review was received', de: 'Eine Bewertung ist eingegangen' },
    },
  ],
  usageMetrics: [
    {
      name: REVIEW_SUBMISSIONS_METRIC,
      kind: 'counter',
      unit: 'count',
      label: { en: 'Reviews received', de: 'Erhaltene Bewertungen' },
    },
  ],
  publicRoutes(router) {
    reviewsSubmissionRoute(router);
    reviewsReadRoutes(router);
  },
  adminRoutes: reviewsAdminRoutes,
  retention: {
    purgeExpired: (runtime, { now, limit }) => reviewsRepository(runtime).purgeExpired(now, limit),
    recomputeExpiry: (runtime, instance, now) =>
      reviewsRepository(runtime).recomputeExpiry(
        instance.id,
        instance.config.retentionDays,
        now,
        SPAM_RETENTION_DAYS,
      ),
  },
  privacy: reviewPrivacy,
});
