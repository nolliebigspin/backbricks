import { tenantHeaders, useTenant } from './context.tsx';
import { useProject } from './project-shell.tsx';

/** One tenant/project boundary for module queries and their invalidation. */
export function useModuleScope(type: string) {
  const { organizationId } = useTenant();
  const project = useProject();
  return {
    organizationId,
    projectId: project.id,
    prefix: ['tenant', organizationId, project.id, type] as const,
    headers: tenantHeaders(organizationId),
  };
}
