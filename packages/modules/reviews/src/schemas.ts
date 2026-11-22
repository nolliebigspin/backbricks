import {
  instanceKeySchema,
  isTypeId,
  moduleInstanceSchema,
  reviewModerationStatusSchema,
  spamVerdictSchema,
} from '@backbricks/core';
import { z } from 'zod';

import { reviewFieldsSchema } from './submission-schema.ts';

export const reviewIdSchema = z
  .string()
  .refine((value) => isTypeId(value, 'rev'), 'Invalid review ID.');
export const reviewIdParams = z.object({ id: reviewIdSchema }).strict();
export const reviewCollectionParams = z.object({ key: instanceKeySchema }).strict();
const timestamp = z.iso.datetime();
const count = z.number().int().nonnegative();

export const publicReviewSchema = z
  .object({
    id: reviewIdSchema,
    rating: z.number().int(),
    title: z.string().nullable(),
    body: z.string().nullable(),
    displayName: z.string(),
    fields: reviewFieldsSchema,
    publishedAt: timestamp,
  })
  .strict();

export const publicStatsSchema = z
  .object({
    ratingScale: z.number().int(),
    count,
    average: z.number().nullable(),
    distribution: z.array(z.object({ rating: z.number().int(), count }).strict()),
  })
  .strict();

export const moderationCountsSchema = z
  .object({ pending: count, approved: count, published: count, rejected: count })
  .strict();

export const reviewSummarySchema = publicReviewSchema
  .pick({ id: true, rating: true, title: true, body: true })
  .extend({
    collectionId: moduleInstanceSchema.shape.id,
    authorName: z.string(),
    moderationStatus: reviewModerationStatusSchema,
    publishedAt: timestamp.nullable(),
    createdAt: timestamp,
    isTest: z.boolean(),
  })
  .strict();

export const reviewDetailSchema = reviewSummarySchema
  .extend({
    email: z.string().nullable(),
    publicFields: reviewFieldsSchema,
    privateFields: reviewFieldsSchema,
    moderatedAt: timestamp.nullable(),
    expiresAt: timestamp.nullable(),
    spamVerdict: spamVerdictSchema.shape.status,
  })
  .strict();
