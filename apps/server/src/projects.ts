import type { ApiRoutes } from './http/api-routes.ts';
import { projectRoutes } from './routes/projects.ts';
import type { ServerServices } from './services.ts';

/** Production and tests mount the same routes over the shared runtime's services. */
export function registerProjects(
  api: ApiRoutes,
  services: Pick<ServerServices, 'withTenant' | 'projects'>,
) {
  projectRoutes(api, services);
}
