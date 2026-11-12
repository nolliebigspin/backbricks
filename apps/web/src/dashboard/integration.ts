import { useQuery } from '@tanstack/react-query';

import { admin } from '../auth/client.ts';
import { tenantHeaders, useTenant } from './context.tsx';
import { unwrap } from './feedback.tsx';
import { useProject } from './project-shell.tsx';

/** API address and active publishable key of the current project, for embed instructions. */
export function useIntegration() {
  const { organizationId } = useTenant();
  const project = useProject();
  return useQuery({
    queryKey: ['tenant', organizationId, project.id, 'integration'],
    queryFn: async ({ signal }) =>
      unwrap(
        await admin.GET('/v1/projects/{projectId}/integration', {
          params: { path: { projectId: project.id } },
          headers: tenantHeaders(organizationId),
          signal,
        }),
      ),
  });
}
