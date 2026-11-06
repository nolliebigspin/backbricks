import type { ApiRoutes } from './http/api-routes.ts';
import { keyRoutes } from './routes/keys.ts';
import type { ServerServices } from './services.ts';

/** Permission/schema declarations share one enabled-module snapshot with the key lifecycle service. */
export function registerKeys(
  api: ApiRoutes,
  services: Pick<ServerServices, 'withTenant' | 'keys' | 'scopeCatalog'>,
  enabledModules: readonly string[],
) {
  keyRoutes(api, { ...services, enabledModules });
}
