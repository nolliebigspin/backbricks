import type { AdminOperations } from '@backbricks/sdk/admin';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { admin } from '../../auth/client.ts';
import { unwrap } from '../../dashboard/feedback.tsx';
import { useModuleScope } from '../../dashboard/module-scope.ts';

type JsonReply<Operation extends keyof AdminOperations> = AdminOperations[Operation] extends {
  responses: { 200: { content: { 'application/json': infer Value } } };
}
  ? Value
  : never;
export type ReviewCollection = JsonReply<'reviews.instance.read'>;
export type ReviewItem = JsonReply<'reviews.records.list'>['data'][number];
export type ReviewAction =
  AdminOperations['reviews.records.moderate']['requestBody']['content']['application/json']['action'];
type ReviewStatus = NonNullable<
  AdminOperations['reviews.records.list']['parameters']['query']
>['status'];

export const useReviewsScope = () => useModuleScope('reviews');

export function useReviewCollections() {
  const scope = useReviewsScope();
  return useInfiniteQuery({
    queryKey: [...scope.prefix, 'collections'],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) =>
      unwrap(
        await admin.GET('/v1/projects/{projectId}/review-collections', {
          params: { path: { projectId: scope.projectId }, query: { cursor: pageParam } },
          headers: scope.headers,
          signal,
        }),
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}

export function useReviewCollection(key: string) {
  const scope = useReviewsScope();
  return useQuery({
    queryKey: [...scope.prefix, 'collection', key],
    queryFn: async ({ signal }) =>
      unwrap(
        await admin.GET('/v1/projects/{projectId}/review-collections/{key}', {
          params: { path: { projectId: scope.projectId, key } },
          headers: scope.headers,
          signal,
        }),
      ),
  });
}

export function useReviewQueue(collection: string, status: ReviewStatus) {
  const scope = useReviewsScope();
  return useInfiniteQuery({
    queryKey: [...scope.prefix, 'queue', collection, status],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) =>
      unwrap(
        await admin.GET('/v1/projects/{projectId}/reviews', {
          params: {
            path: { projectId: scope.projectId },
            query: { collection, status, cursor: pageParam, limit: 20 },
          },
          headers: scope.headers,
          signal,
        }),
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}

export function useReviewDetail(id: string | null) {
  const scope = useReviewsScope();
  return useQuery({
    queryKey: [...scope.prefix, 'detail', id],
    enabled: id !== null,
    queryFn: async ({ signal }) =>
      unwrap(
        await admin.GET('/v1/projects/{projectId}/reviews/{id}', {
          params: { path: { projectId: scope.projectId, id: id ?? '' } },
          headers: scope.headers,
          signal,
        }),
      ),
  });
}

export function useReviewStats(key: string) {
  const scope = useReviewsScope();
  return useQuery({
    queryKey: [...scope.prefix, 'stats', key],
    queryFn: async ({ signal }) =>
      unwrap(
        await admin.GET('/v1/projects/{projectId}/review-collections/{key}/stats', {
          params: { path: { projectId: scope.projectId, key } },
          headers: scope.headers,
          signal,
        }),
      ),
  });
}
