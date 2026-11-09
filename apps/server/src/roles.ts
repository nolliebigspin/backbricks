import { type Config, createIpIdentity } from '@backbricks/core';
import {
  createPublishableKeyLookup,
  createDatabase,
  createPostgresQueue,
  runMigrations,
} from '@backbricks/db';

import { createApp } from './app.ts';
import { createServerAuth } from './auth.ts';
import { findDashboard } from './dashboard.ts';
import { createServerKeyAuth } from './key-auth.ts';
import type { Logger } from './logger.ts';
import { createServerMaintenance } from './maintenance.ts';
import { createApiAuthorization } from './middleware/authorization.ts';
import { moduleJobDefinitions } from './module-jobs.ts';
import { moduleCatalog } from './modules.ts';
import { createServerOutbox } from './outbox.ts';
import { createPublicCredentialResolver } from './public-auth.ts';
import { platformRoutes } from './routes/platform.ts';
import { createServerServices } from './services.ts';

/** A started role; `stop` drains it for a graceful shutdown. */
export type RunningRole = { stop: () => Promise<void> };

export const ROLES = ['serve', 'worker', 'all', 'migrate'] as const;
export type Role = (typeof ROLES)[number];

export function isRole(value: string | undefined): value is Role {
  return (ROLES as readonly (string | undefined)[]).includes(value);
}

/** A shared database/queue/provider lifetime for each process, including the combined role. */
async function startRuntime(
  config: Config,
  log: Logger,
  role: 'serve' | 'worker' | 'all',
): Promise<RunningRole> {
  const database = createDatabase(config.databaseUrl, { applicationName: `backbricks-${role}` });
  const modules = moduleCatalog.select(config.modules);
  const queue = createPostgresQueue(database.db, moduleJobDefinitions(modules), (name) =>
    log.error({ job: name }, 'queue operation failed'),
  );
  let services: ReturnType<typeof createServerServices> | undefined;
  let auth: ReturnType<typeof createServerAuth> | undefined;
  let keyAuth: ReturnType<typeof createServerKeyAuth> | undefined;
  let server: ReturnType<typeof Bun.serve> | undefined;
  const stop = async () => {
    await server?.stop();
    await keyAuth?.close();
    await auth?.close();
    await queue.stop();
    await services?.close();
    await database.close();
  };
  try {
    await queue.start();
    const runtime = createServerServices(config, database.db, {
      modules,
      queue: queue.queue,
      enqueueProject: queue.enqueueProject,
      enqueueNotificationMail: queue.enqueueNotificationMail,
    });
    services = runtime;
    if (role !== 'worker') {
      const dashboardDir = findDashboard();
      const dashboardAuth = createServerAuth(config, database.db, log, runtime, queue);
      auth = dashboardAuth;
      const keys = createServerKeyAuth(config, database.db, log, runtime, true);
      keyAuth = keys;
      const resolvePublic = createPublicCredentialResolver({
        clock: runtime.container.core.clock,
        withTenant: runtime.withTenant,
        resolveSecret: keys.resolveKey,
        lookupPublishable: createPublishableKeyLookup(database.db),
      });
      const app = createApp(
        {
          log,
          ids: runtime.container.core.ids,
          rateLimiter: runtime.container.core.rateLimiter,
          modules,
          ipIdentity: createIpIdentity({
            appSecret: config.appSecret,
            clock: runtime.container.core.clock,
            trustedProxies: config.trustedProxies,
          }),
          readinessChecks: [{ name: 'database', check: database.ping }, ...runtime.readinessChecks],
          dashboardDir,
          auth: dashboardAuth,
        },
        (api) => platformRoutes(api, runtime, { resolvePublic }),
        createApiAuthorization({
          config,
          db: database.db,
          auth: dashboardAuth,
          resolveKey: keys.resolveKey,
        }),
      );
      server = Bun.serve({ port: config.port, fetch: app.fetch, development: false });
      log.info(
        { port: server.port, modules: config.modules, dashboard: dashboardDir !== null },
        'serve ready',
      );
    }
    if (role !== 'serve') {
      await queue.consume(runtime.jobs, runtime.withTenant);
      await queue.consumeMail(runtime.container.optional('mailer'));
      const outbox = createServerOutbox(config, database.db, runtime, queue);
      await queue.scheduleSystem('core.outbox.dispatch', '* * * * *', (_runId, after) =>
        outbox.tick(after),
      );
      const maintenance = createServerMaintenance(database.db, runtime, queue);
      await queue.scheduleSystem('core.maintenance.cleanup', '* * * * *', (_runId, after) =>
        maintenance.cleanup(after),
      );
      await queue.scheduleSystem('core.maintenance.tenants', '0 * * * *', (runId, after) =>
        maintenance.fanout(runId, after),
      );
      await Promise.all(
        runtime.jobs
          .filter((job) => job.cron)
          .map((job) =>
            queue.scheduleSystem(`core.schedule.${job.name}`, job.cron ?? '', (runId, after) =>
              maintenance.fanout(runId, after, job.name),
            ),
          ),
      );

      log.info({ modules: config.modules, jobs: runtime.jobs.length }, 'worker ready');
    }
    return { stop };
  } catch (error) {
    await stop();
    throw error;
  }
}

/** HTTP and queue producer; it never consumes worker jobs. */
export const startServe = (config: Config, log: Logger) => startRuntime(config, log, 'serve');
/** Registered queue consumers with no HTTP listener. */
export const startWorker = (config: Config, log: Logger) => startRuntime(config, log, 'worker');
/** Small-install composition shares one physical database pool and provider lifetime. */
export const startAll = (config: Config, log: Logger) => startRuntime(config, log, 'all');

/** One-shot: applies pending migrations under the advisory lock, then the process exits. */
export async function migrate(config: Config, log: Logger): Promise<void> {
  const { applied } = await runMigrations(config.databaseUrl);
  log.info({ applied }, 'migrations applied');
}
