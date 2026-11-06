import { type Config, createIds, systemClock } from '@backbricks/core';
import { createDatabase, runMigrations } from '@backbricks/db';

import { createApp } from './app.ts';
import { findDashboard } from './dashboard.ts';
import type { Logger } from './logger.ts';

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
  const app = createApp({
    log,
    ids: createIds(systemClock),
    readinessChecks: [{ name: 'database', check: database.ping }],
    dashboardDir,
  });
  const server = Bun.serve({ port: config.port, fetch: app.fetch, development: false });
  log.info(
    { port: server.port, modules: config.modules, dashboard: dashboardDir !== null },
    'serve ready',
  );
  return {
    async stop() {
      await server.stop(); // stops accepting, waits for in-flight requests
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
  // Keeps the event loop alive while there are no jobs to poll yet.
  const idle = setInterval(() => {}, 60_000);
  log.info({ modules: config.modules }, 'worker ready');
  return {
    async stop() {
      clearInterval(idle);
      await database.close();
    },
  };
}

/** One-shot: applies pending migrations under the advisory lock, then the process exits. */
export async function migrate(config: Config, log: Logger): Promise<void> {
  const { applied } = await runMigrations(config.databaseUrl);
  log.info({ applied }, 'migrations applied');
}
