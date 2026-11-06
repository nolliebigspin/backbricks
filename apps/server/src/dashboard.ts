import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Hono } from 'hono';
import { serveStatic } from 'hono/serve-static';

import type { AppEnv } from './context.ts';

/** Where the dashboard build lands (`apps/web/dist`); the image copies it to the same path. */
export const DASHBOARD_DIR = fileURLToPath(new URL('../../web/dist', import.meta.url));

/** The built dashboard, or `null` in development (Vite serves it) and API-only setups. */
export function findDashboard(dir: string = DASHBOARD_DIR): string | null {
  return existsSync(join(dir, 'index.html')) ? dir : null;
}

// Paths that belong to the API; a missing route there is a 404 problem, never the SPA.
const API_PREFIX = /^\/(v1|api)(\/|$)/;

async function fileResponse(path: string): Promise<Response | null> {
  const file = Bun.file(path);
  if (!(await file.exists())) return null;
  // Set explicitly: Bun derives it lazily, and Hono copies only the headers that are set.
  return new Response(file, { headers: { 'Content-Type': file.type } });
}

/**
 * Serves the dashboard SPA (ADR-0006): hashed assets with long-lived caching, other files
 * from the build root, and `index.html` for every other GET so client-side routes work on
 * reload. Hono's serve-static rejects `..`, encoded and doubled separators in paths.
 */
export function dashboardRoutes(dir: string): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  const files = serveStatic<AppEnv>({ root: dir, join, getContent: fileResponse });

  routes.use('/assets/*', async (c, next) => {
    c.header('Cache-Control', 'public, max-age=31536000, immutable');
    await next();
  });
  routes.get('/assets/*', files, (c) => c.notFound());

  routes.get('*', async (c, next) => {
    if (API_PREFIX.test(c.req.path)) return c.notFound();
    c.header('Cache-Control', 'no-cache');
    return next();
  });
  routes.get('*', files, async (c) => {
    const index = await fileResponse(join(dir, 'index.html'));
    return index ? c.newResponse(index.body, index) : c.notFound();
  });

  return routes;
}
