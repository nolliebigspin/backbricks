import type { AdminOperations } from '@backbricks/sdk/admin';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { admin } from '../../auth/client.ts';
import { accountError } from '../../auth/navigation.ts';
import { tenantHeaders, useTenant } from '../../dashboard/context.tsx';
import { unwrap } from '../../dashboard/feedback.tsx';
import { useProject } from '../../dashboard/project-shell.tsx';

export type FormInstance =
  AdminOperations['forms.instance.read']['responses'][200]['content']['application/json'];
export type NotificationRule =
  AdminOperations['notifications.list']['responses'][200]['content']['application/json']['data'][number];
export const SUBMISSION_EVENT = 'forms.submission.created';

/** All forms queries of a project share one prefix, so a change refreshes every view. */
export function useFormsScope() {
  const { organizationId } = useTenant();
  const project = useProject();
  return {
    organizationId,
    projectId: project.id,
    prefix: ['tenant', organizationId, project.id, 'forms'] as const,
    headers: tenantHeaders(organizationId),
  };
}

export function useForms() {
  const scope = useFormsScope();
  return useInfiniteQuery({
    queryKey: [...scope.prefix, 'list'],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ signal, pageParam }) =>
      unwrap(
        await admin.GET('/v1/projects/{projectId}/forms', {
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

export function useForm(key: string) {
  const scope = useFormsScope();
  return useQuery({
    queryKey: [...scope.prefix, key],
    queryFn: async ({ signal }) =>
      unwrap(
        await admin.GET('/v1/projects/{projectId}/forms/{key}', {
          params: { path: { projectId: scope.projectId, key } },
          headers: scope.headers,
          signal,
        }),
      ),
  });
}

export function useFormSummary(key: string) {
  const scope = useFormsScope();
  return useQuery({
    queryKey: [...scope.prefix, key, 'summary'],
    queryFn: async ({ signal }) =>
      unwrap(
        await admin.GET('/v1/projects/{projectId}/forms/{key}/summary', {
          params: { path: { projectId: scope.projectId, key } },
          headers: scope.headers,
          signal,
        }),
      ),
  });
}

/** Notification rules are admin-only on the server; members never request them. */
export function useNotificationRules(enabled: boolean) {
  const scope = useFormsScope();
  return useQuery({
    queryKey: [...scope.prefix, 'notification-rules'],
    enabled,
    queryFn: async ({ signal }) =>
      unwrap(
        await admin.GET('/v1/projects/{projectId}/notification-rules', {
          params: { path: { projectId: scope.projectId }, query: { limit: 100 } },
          headers: scope.headers,
          signal,
        }),
      ).data,
  });
}

export function useNotificationOptions(enabled: boolean) {
  const scope = useFormsScope();
  return useQuery({
    queryKey: [...scope.prefix, 'notification-options'],
    enabled,
    queryFn: async ({ signal }) =>
      unwrap(
        await admin.GET('/v1/projects/{projectId}/notification-rules/options', {
          params: { path: { projectId: scope.projectId } },
          headers: scope.headers,
          signal,
        }),
      ),
  });
}

/** Plain-language messages for configuration writes (stale versions, missing rights). */
export function formsError(error: unknown, conflict = 'forms.errors.stale'): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : '';
  if (code === 'conflict') return conflict;
  if (code === 'module_not_enabled') return 'forms.unavailable';
  if (code === 'forbidden') return 'forms.errors.forbidden';
  return accountError(error);
}
