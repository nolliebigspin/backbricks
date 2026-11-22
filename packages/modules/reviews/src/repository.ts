import type {
  PublicRequestSource,
  PublicWriteContext,
  RepositoryPage,
  reviewModerationStatusSchema,
} from '@backbricks/core';
import { z } from 'zod';

export const reviewSortSchema = z.enum(['newest', 'rating_desc', 'rating_asc']);
export const reviewFilterSchema = z.enum([
  'pending',
  'approved',
  'published',
  'rejected',
  'to_review',
]);

export type ReviewRecord = Readonly<{
  id: string;
  instanceId: string;
  configVersion: number;
  rating: number;
  title: string | null;
  body: string | null;
  authorName: string;
  subjectEmail: string | null;
  publicFields: Record<string, string>;
  privateFields: Record<string, string>;
  moderationStatus: z.output<typeof reviewModerationStatusSchema>;
  publishedAt: Date | null;
  moderatedBy: string | null;
  moderatedAt: Date | null;
  spamVerdict: PublicWriteContext['spam']['status'];
  isTest: boolean;
  source: PublicRequestSource;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date | null;
}>;
export type ReviewChange = Pick<
  ReviewRecord,
  'moderationStatus' | 'publishedAt' | 'moderatedBy' | 'moderatedAt' | 'updatedAt'
>;
export type PublicReviewRow = Pick<
  ReviewRecord,
  'id' | 'rating' | 'title' | 'body' | 'authorName' | 'publicFields'
> & {
  publishedAt: Date;
};
export type ReviewSort = z.output<typeof reviewSortSchema>;
export type ReviewFilter = z.output<typeof reviewFilterSchema>;
export type ReviewPosition = Pick<PublicReviewRow, 'id' | 'rating' | 'publishedAt'>;

export interface ReviewsRepository {
  insert(input: ReviewRecord): Promise<void>;
  get(id: string, now: Date, lock?: boolean): Promise<ReviewRecord>;
  list(
    instanceId: string,
    filter: ReviewFilter | undefined,
    now: Date,
    page: RepositoryPage,
  ): Promise<ReviewRecord[]>;
  patch(id: string, changes: ReviewChange): Promise<void>;
  delete(id: string): Promise<void>;
  listPublished(
    instanceId: string,
    now: Date,
    sort: ReviewSort,
    page: { limit: number; before?: ReviewPosition },
  ): Promise<PublicReviewRow[]>;
  ratingCounts(instanceId: string, now: Date): Promise<{ rating: number; count: number }[]>;
  adminCounts(
    instanceId: string,
    now: Date,
  ): Promise<{
    ratings: { rating: number; count: number }[];
    moderation: { pending: number; approved: number; published: number; rejected: number };
  }>;
  purgeExpired(now: Date, limit: number): Promise<number>;
  recomputeExpiry(
    instanceId: string,
    days: number | null,
    now: Date,
    spamDays: number,
  ): Promise<number>;
  findBySubject(email: string, page: RepositoryPage): Promise<ReviewRecord[]>;
  deleteBySubject(email: string, limit: number): Promise<number>;
  eraseBatch(limit: number): Promise<number>;
}

declare module '@backbricks/core' {
  interface ModuleRepositories {
    readonly reviews: ReviewsRepository;
  }
}
