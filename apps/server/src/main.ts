#!/usr/bin/env bun
/**
 * Entry point and composition root: `bun apps/server/src/main.ts <serve|worker|all|migrate>`.
 * One image, several roles (ARCHITECTURE §A.1, ADR-0002); `all` runs serve and worker in one
 * process for the smallest installs. The `setup` role arrives with P6.2 (DEV-7).
 */
import {
  formatConfigIssues,
  loadConfigFromProcessEnv,
  PROCESS_SHUTDOWN_TIMEOUT_MS,
} from '@backbricks/core';

import { createLogger } from './logger.ts';
import { availableModules } from './modules.ts';
import {
  isRole,
  migrate,
  ROLES,
  type RunningRole,
  startAll,
  startServe,
  startWorker,
} from './roles.ts';

const role = process.argv[2];
if (!isRole(role)) {
  process.stderr.write(`Usage: bun apps/server/src/main.ts <${ROLES.join('|')}>\n`);
  process.exit(2);
}

const result = loadConfigFromProcessEnv(availableModules);
if (!result.ok) {
  process.stderr.write(`${formatConfigIssues(result.issues)}\n`);
  process.exit(1);
}
const { config } = result;
const log = createLogger(config.logLevel).child({ role });

if (role === 'migrate') {
  try {
    await migrate(config, log);
    process.exit(0);
  } catch (error) {
    log.fatal({ err: error }, 'migration failed');
    process.exit(1);
  }
}

const running: RunningRole[] = [];
try {
  if (role === 'serve') running.push(await startServe(config, log));
  if (role === 'worker') running.push(await startWorker(config, log));
  if (role === 'all') running.push(await startAll(config, log));
} catch (error) {
  log.fatal({ err: error }, 'startup failed');
  process.exit(1);
}

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info({ signal }, 'shutting down');
  const timeout = setTimeout(() => {
    log.error('shutdown timed out');
    process.exit(1);
  }, PROCESS_SHUTDOWN_TIMEOUT_MS);
  try {
    await Promise.all(running.map((part) => part.stop()));
    clearTimeout(timeout);
    log.info('stopped');
    process.exit(0);
  } catch (error) {
    log.error({ err: error }, 'shutdown failed');
    process.exit(1);
  }
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => void shutdown(signal));
}
