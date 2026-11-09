import { createChallengeService, type PublicCredentialResolver } from '@backbricks/core';

import type { ApiRoutes } from '../http/api-routes.ts';
import { registerKeys } from '../keys.ts';
import { registerProjects } from '../projects.ts';
import { createPublicExecutor } from '../public-executor.ts';
import type { ServerServices } from '../services.ts';
import { challengeRoutes } from './challenge.ts';
import { configurationRoutes } from './configuration.ts';
import { instanceRoutes } from './instances.ts';
import { metaRoutes } from './meta.ts';
import { moduleRoutes, type ModulePublicExecutor } from './modules.ts';
import { notificationRuleRoutes } from './notification-rules.ts';
import { platformReadRoutes } from './platform-reads.ts';
import { privacyRoutes } from './privacy.ts';

/** The actual platform registration list, shared by runtime, real HTTP fixtures and offline export. */
export function platformRoutes(
  api: ApiRoutes,
  services: ServerServices,
  deps: { resolvePublic: PublicCredentialResolver; executePublic?: ModulePublicExecutor },
) {
  registerProjects(api, services);
  registerKeys(
    api,
    services,
    services.modules.metadata.modules
      .filter((module) => module.enabled)
      .map((module) => module.type),
  );
  platformReadRoutes(api, services);
  notificationRuleRoutes(api, services);
  privacyRoutes(api, services);
  metaRoutes(api, services.modules, services.authCapabilities);
  instanceRoutes(api, services);
  configurationRoutes(api, services);
  challengeRoutes(api, {
    captcha: services.captcha,
    issue: createChallengeService({
      clock: services.container.core.clock,
      captcha: services.captcha,
      limiter: services.container.core.rateLimiter,
      withTenant: services.withTenant,
      resolve: deps.resolvePublic,
    }),
    resolve: deps.resolvePublic,
    withTenant: services.withTenant,
  });
  moduleRoutes(
    api,
    services,
    deps.executePublic ?? createPublicExecutor(services, deps.resolvePublic),
    deps.resolvePublic,
  );
}
