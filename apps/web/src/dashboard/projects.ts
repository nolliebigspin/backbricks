import { useInfiniteQuery } from '@tanstack/react-query';

import { admin } from '../auth/client.ts';
import { tenantHeaders, useTenant } from './context.tsx';
import { unwrap } from './feedback.tsx';

export async function readProject(organizationId: string, projectId: string, signal?: AbortSignal) {
  return unwrap(
    await admin.GET('/v1/projects/{projectId}', {
      params: { path: { projectId } },
      headers: tenantHeaders(organizationId),
      signal,
    }),
  );
}
export type Project = Awaited<ReturnType<typeof readProject>>;

export function useProjects() {
  const { organizationId } = useTenant();
  return useInfiniteQuery({
    queryKey: ['tenant', organizationId, 'projects'],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ signal, pageParam }) =>
      unwrap(
        await admin.GET('/v1/projects', {
          headers: tenantHeaders(organizationId),
          params: { query: { limit: 50, ...(pageParam ? { cursor: pageParam } : {}) } },
          signal,
        }),
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}
