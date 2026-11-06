import { AppError } from '@backbricks/core';
import { Hono } from 'hono';

import type { AppEnv, ReadinessCheck } from './context.ts';

/**
 * `/healthz`: the process is up (liveness). `/readyz`: every dependency the enabled modules
 * need answers (readiness); in P0 that is Postgres, P1.8 adds object storage (DEV-4).
 * Failure details go to the log, never into the response.
 */
export function healthRoutes(checks: readonly ReadinessCheck[]): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get('/healthz', (c) => c.json({ status: 'ok' }));

  routes.get('/readyz', async (c) => {
    const results = await Promise.all(
      checks.map(async ({ name, check }) => {
        try {
          await check();
          return { name, ok: true };
        } catch (error) {
          c.get('log').warn({ err: error, check: name }, 'readiness check failed');
          return { name, ok: false };
        }
      }),
    );
    const failing = results.filter((result) => !result.ok).map((result) => result.name);
    if (failing.length > 0) {
      throw new AppError('service_unavailable', { detail: `Not ready: ${failing.join(', ')}.` });
    }
    return c.json({
      status: 'ok',
      checks: Object.fromEntries(results.map(({ name }) => [name, 'ok'])),
    });
  });

  return routes;
}
