import { createSmtpMailer } from '@backbricks/adapters';
import {
  createAuditService,
  createEventService,
  createIds,
  createKeyService,
  createKeyScopeCatalog,
  createProjectService,
  createInstanceService,
  createConfigurationService,
  createPlatformQueries,
  createRateLimiter,
  createServiceContainer,
  createUnlimitedEntitlements,
  createUsageService,
  systemClock,
  type Clock,
  type Config,
  type Entitlements,
  type SelectedModules,
} from '@backbricks/core';
import { createPostgresRateLimitStore, createWithTenant, type Database } from '@backbricks/db';

import { moduleJobs } from './module-jobs.ts';
import { moduleCatalog } from './modules.ts';

/** One provider/service lifetime per server runtime. Modules receive only the core's restricted views. */
export function createServerServices(
  config: Config,
  db: Database,
  options: {
    clock?: Clock;
    entitlements?: Entitlements;
    modules?: SelectedModules;
    moduleRepositories?: Parameters<typeof createWithTenant>[1];
  } = {},
) {
  const modules = options.modules ?? moduleCatalog.select(config.modules);
  const scopeCatalog = createKeyScopeCatalog(modules.registry.scopes);
  const clock = options.clock ?? systemClock;
  const ids = createIds(clock);
  const activity = { clock, ids };
  const mailer = config.mailer ? createSmtpMailer(config.mailer) : null;
  const container = createServiceContainer(
    {
      ...activity,
      audit: createAuditService(activity),
      events: createEventService(activity),
      usage: createUsageService(clock),
      entitlements: options.entitlements ?? createUnlimitedEntitlements(),
      rateLimiter: createRateLimiter(createPostgresRateLimitStore(db), clock),
    },
    { mailer },
  );
  const withTenant = createWithTenant(db, options.moduleRepositories);
  const moduleRuntime = modules.registry.bind(container);
  return Object.freeze({
    container,
    modules,
    scopeCatalog,
    moduleRuntime,
    jobs: moduleJobs(modules, moduleRuntime, withTenant),
    withTenant,
    projects: createProjectService(container.core),
    instances: createInstanceService({
      ...container.core,
      registry: modules.registry,
      runtime: moduleRuntime,
    }),
    configuration: createConfigurationService({
      ...container.core,
      registry: modules.registry,
      runtime: moduleRuntime,
      appSecret: config.appSecret,
    }),
    queries: createPlatformQueries({ ...container.core, publicUrl: config.publicUrl, modules }),
    keys: createKeyService({ ...container.core, enabledModules: config.modules, scopeCatalog }),
    async close() {
      await mailer?.close();
    },
  });
}
export type ServerServices = ReturnType<typeof createServerServices>;
