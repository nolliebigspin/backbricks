import { type Config, createIpIdentity } from '@backbricks/core';
import { createDatabase, runMigrations } from '@backbricks/db';

import { createApp } from './app.ts';
import { createServerAuth } from './auth.ts';
import { findDashboard } from './dashboard.ts';
import { createServerKeyAuth } from './key-auth.ts';
import { registerKeys } from './keys.ts';
import type { Logger } from './logger.ts';
import { createApiAuthorization } from './middleware/authorization.ts';
import { registerProjects } from './projects.ts';
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

/** HTTP: public and management API, auth routes, dashboard (ARCHITECTURE §A.1). */
export function startServe(config: Config, log: Logger): RunningRole {
  const database = createDatabase(config.databaseUrl, { applicationName: 'backbricks-serve' });
  const dashboardDir = findDashboard();
  const services = createServerServices(config, database.db);
  const auth = createServerAuth(config, database.db, log, services);
  const keyAuth = createServerKeyAuth(config, database.db, log, services);
  const app = createApp(
    {
      log,
      ids: services.container.core.ids,
      modules: services.modules,
      ipIdentity: createIpIdentity({
        appSecret: config.appSecret,
        clock: services.container.core.clock,
        trustedProxies: config.trustedProxies,
      }),
      readinessChecks: [{ name: 'database', check: database.ping }],
      dashboardDir,
      auth,
    },
    (api) => {
      registerProjects(api, services);
      registerKeys(api, services, config.modules);
      platformReadRoutes(api, services);
      metaRoutes(api, services.modules);
      instanceRoutes(api, services);
      moduleRoutes(api, services);
    },
    createApiAuthorization({ config, db: database.db, auth, resolveKey: keyAuth.resolveKey }),
  );
  const server = Bun.serve({ port: config.port, fetch: app.fetch, development: false });
  log.info(
    { port: server.port, modules: config.modules, dashboard: dashboardDir !== null },
    'serve ready',
  );
  return {
    async stop() {
      await server.stop(); // stops accepting, waits for in-flight requests
      await keyAuth.close();
      await auth.close();
      await services.close();
      await database.close();
    },
  };
}

/**
 * Background jobs. Until pg-boss arrives (P1.10) the worker only holds its database
 * connection, so the process roles and shutdown can already be deployed and tested.
 */
export async function startWorker(config: Config, log: Logger): Promise<RunningRole> {
  const database = createDatabase(config.databaseUrl, { applicationName: 'backbricks-worker' });
  await database.ping();
  const services = createServerServices(config, database.db);
  // Keeps the event loop alive while there are no jobs to poll yet.
  const idle = setInterval(() => {}, 60_000);
  log.info(
    {
      modules: config.modules,
      jobs: services.jobs.length,
    },
    'worker ready',
  );
  return {
    async stop() {
      clearInterval(idle);
      await services.close();
      await database.close();
    },
  };
}

/** One-shot: applies pending migrations under the advisory lock, then the process exits. */
export async function migrate(config: Config, log: Logger): Promise<void> {
  const { applied } = await runMigrations(config.databaseUrl);
  log.info({ applied }, 'migrations applied');
}
