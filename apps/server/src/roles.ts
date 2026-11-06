import { type Config, createIpIdentity, createChallengeService } from '@backbricks/core';
import { createDatabase, createPostgresQueue, runMigrations } from '@backbricks/db';

import { createApp } from './app.ts';
import { createServerAuth } from './auth.ts';
import { findDashboard } from './dashboard.ts';
import { createServerKeyAuth } from './key-auth.ts';
import { registerKeys } from './keys.ts';
import type { Logger } from './logger.ts';
import { createApiAuthorization } from './middleware/authorization.ts';
import { moduleCatalog } from './modules.ts';
import { registerProjects } from './projects.ts';
import { createPublicCredentialResolver } from './public-auth.ts';
import { createPublicExecutor } from './public-executor.ts';
import { challengeRoutes } from './routes/challenge.ts';
import { configurationRoutes } from './routes/configuration.ts';
import { instanceRoutes } from './routes/instances.ts';
import { metaRoutes } from './routes/meta.ts';
import { moduleRoutes } from './routes/modules.ts';
import { platformReadRoutes } from './routes/platform-reads.ts';
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
  const queue = createPostgresQueue(
    database.db,
    modules.registry.modules.flatMap((module) =>
      module.jobs.map((job) => ({
        name: job.name,
        retries: job.retries,
        retentionSeconds: job.retentionSeconds,
        payload: job.payload,
      })),
    ),
    (name) => log.error({ job: name }, 'queue operation failed'),
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
    const runtime = createServerServices(config, database.db, { modules, queue: queue.queue });
    services = runtime;
    if (role !== 'worker') {
      const dashboardDir = findDashboard();
      const dashboardAuth = createServerAuth(config, database.db, log, runtime);
      auth = dashboardAuth;
      const keys = createServerKeyAuth(config, database.db, log, runtime);
      keyAuth = keys;
      const resolvePublic = createPublicCredentialResolver({
        clock: runtime.container.core.clock,
        withTenant: runtime.withTenant,
        resolveSecret: keys.resolveKey,
      });
      const issueChallenge = createChallengeService({
        clock: runtime.container.core.clock,
        captcha: runtime.captcha,
        limiter: runtime.container.core.rateLimiter,
        withTenant: runtime.withTenant,
        resolve: resolvePublic,
      });
      const app = createApp(
        {
          log,
          ids: runtime.container.core.ids,
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
        (api) => {
          registerProjects(api, runtime);
          registerKeys(api, runtime, config.modules);
          platformReadRoutes(api, runtime);
          metaRoutes(api, modules);
          instanceRoutes(api, runtime);
          configurationRoutes(api, runtime);
          challengeRoutes(api, {
            captcha: runtime.captcha,
            issue: issueChallenge,
            resolve: resolvePublic,
            withTenant: runtime.withTenant,
          });
          moduleRoutes(api, runtime, createPublicExecutor(runtime, resolvePublic), resolvePublic);
        },
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
