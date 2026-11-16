import type { AdminOperations } from '@backbricks/sdk/admin';
import { useInfiniteQuery } from '@tanstack/react-query';

import { admin } from '../../auth/client.ts';
import { accountError } from '../../auth/navigation.ts';
import { unwrap } from '../../dashboard/feedback.tsx';
import { useModuleScope } from '../../dashboard/module-scope.ts';

export type FileItem =
  AdminOperations['uploads.files.list']['responses'][200]['content']['application/json']['data'][number];
export type FileDetail =
  AdminOperations['uploads.files.read']['responses'][200]['content']['application/json'];
export type FilesQuery = NonNullable<AdminOperations['uploads.files.list']['parameters']['query']>;
export type UploadZone =
  AdminOperations['uploads.instance.read']['responses'][200]['content']['application/json'];
export function useUploadsScope() {
  return useModuleScope('uploads');
}
export function uploadsError(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : '';
  if (code === 'capability_unavailable') return 'uploads.scanUnavailable';
  if (
    code === 'validation_failed' &&
    typeof error === 'object' &&
    error !== null &&
    'errors' in error &&
    Array.isArray(error.errors) &&
    error.errors.some(
      (issue: unknown) =>
        typeof issue === 'object' &&
        issue !== null &&
        'code' in issue &&
        issue.code === 'capability_unavailable',
    )
  )
    return 'uploads.scanUnavailable';
  if (code === 'conflict') return 'uploads.stale';
  if (code === 'module_not_enabled') return 'uploads.unavailable';
  if (code === 'forbidden') return 'forms.errors.forbidden';
  return accountError(error);
}
export function useUploadZones() {
  const scope = useUploadsScope();
  return useInfiniteQuery({
    queryKey: [...scope.prefix, 'zones'],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ signal, pageParam }) =>
      unwrap(
        await admin.GET('/v1/projects/{projectId}/upload-zones', {
          params: {
            path: { projectId: scope.projectId },
            query: { limit: 50, ...(pageParam ? { cursor: pageParam } : {}) },
          },
          headers: scope.headers,
          signal,
        }),
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/** Only accepted byte streams awaiting inspection need readiness refreshes. */
export function isProcessingFile(file: Pick<FileItem, 'status'>) {
  return file.status === 'uploaded' || file.status === 'scanning';
}
