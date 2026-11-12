import { createSmtpMailer, createS3Storage, createAltchaProvider } from '@backbricks/adapters';
import {
  authCapabilities,
  createAuditService,
  createPlatformJobHandlers,
  PLATFORM_JOB_DEFINITIONS,
  createEventService,
  createIds,
  createKeyService,
  createKeyScopeCatalog,
  createProjectService,
  createInstanceService,
  createNotificationRuleService,
  createSubjectPrivacyService,
  createProjectErasureService,
  createConfigurationService,
  createPlatformQueries,
  createRateLimiter,
  createServiceContainer,
  createUnlimitedEntitlements,
  createUsageService,
  systemClock,
  type Clock,
  type Queue,
  type NotificationMailEnqueue,
  type ProjectErasurePorts,
  type ProjectJobEnqueue,
  type TenantContext,
  type Config,
  type Entitlements,
  type SelectedModules,
} from '@backbricks/core';
import {
  createPostgresRateLimitStore,
  createWithTenant,
  createPowReplayStore,
  type Database,
} from '@backbricks/db';

import { moduleJobs } from './module-jobs.ts';
import { moduleRepositories } from './module-repositories.ts';
import { moduleCatalog } from './modules.ts';

/** One provider/service lifetime per server runtime. Modules receive only the core's restricted views. */
export function createServerServices(
  config: Config,
  db: Database,
  options: {
    clock?: Clock;
    queue?: Queue;
    enqueueProject?: ProjectJobEnqueue;
    enqueueNotificationMail?: NotificationMailEnqueue;
    projectErasure?: ProjectErasurePorts;
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
  const storage = config.storage ? createS3Storage(config.storage, clock) : null;
  const captcha = createAltchaProvider({
    appSecret: config.appSecret,
    clock,
    replay: createPowReplayStore(db),
  });
  const container = createServiceContainer(
    {
      ...activity,
      audit: createAuditService(activity),
      events: createEventService(activity),
      usage: createUsageService(clock),
      entitlements: options.entitlements ?? createUnlimitedEntitlements(),
      rateLimiter: createRateLimiter(createPostgresRateLimitStore(db), clock),
    },
    { mailer, storage, captcha, queue: options.queue },
  );
  const withTenant = createWithTenant(
    db,
    options.moduleRepositories ?? moduleRepositories(modules),
  );
  const moduleRuntime = modules.registry.bind(container);
  const instances = createInstanceService({
    ...container.core,
    registry: modules.registry,
    runtime: moduleRuntime,
  });
  return Object.freeze({
    container,
    authCapabilities: authCapabilities(config),
    captcha,
    readinessChecks: storage ? [{ name: 'storage', check: () => storage.check() }] : [],
    modules,
    scopeCatalog,
    moduleRuntime,
    jobs: [
      ...moduleJobs(modules, moduleRuntime, withTenant),
      ...createPlatformJobHandlers(
        { ...container.core, registry: modules.registry, runtime: moduleRuntime },
        options.queue && options.enqueueProject
          ? { queue: options.queue, enqueueProject: options.enqueueProject }
          : undefined,
        // Without SMTP, notification delivery is a no-op; the options route reports it (P2.6b).
        mailer && options.enqueueNotificationMail
          ? { publicUrl: config.publicUrl, enqueueMail: options.enqueueNotificationMail }
          : undefined,
        options.projectErasure,
      ).map((handler) => {
        const definition = PLATFORM_JOB_DEFINITIONS.find((job) => job.name === handler.name);
        if (!definition) throw new Error('Missing platform job definition');
        return Object.freeze({
          ...definition,
          moduleType: 'core',
          cron: undefined,
          consumes: handler.consumes,
          runInTransaction: handler.runInTransaction,
          run: (context: TenantContext, input: unknown) =>
            withTenant(context, (tx) => handler.runInTransaction(tx, input)),
        });
      }),
    ],
    withTenant,
    notificationRules: createNotificationRuleService({
      ...container.core,
      registry: modules.registry,
      emailAvailable: mailer !== null,
    }),
    privacy: createSubjectPrivacyService({
      ...container.core,
      registry: modules.registry,
      runtime: moduleRuntime,
      queue: options.queue,
    }),
    projects: createProjectService(container.core),
    projectErasure: createProjectErasureService({
      audit: container.core.audit,
      ports: options.projectErasure,
    }),
    instances,
    configuration: createConfigurationService({
      ...container.core,
      registry: modules.registry,
      runtime: moduleRuntime,
      appSecret: config.appSecret,
      instances,
    }),
    queries: createPlatformQueries({ ...container.core, publicUrl: config.publicUrl, modules }),
    keys: createKeyService({ ...container.core, enabledModules: config.modules, scopeCatalog }),
    async close() {
      storage?.close();
      await mailer?.close();
    },
  });
}
export type ServerServices = ReturnType<typeof createServerServices>;
