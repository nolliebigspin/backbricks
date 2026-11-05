import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

import { createIds, systemClock } from '@backbricks/core';

import { createApp } from './app.ts';
import { findDashboard } from './dashboard.ts';
import { createLogger } from './logger.ts';

const fixture = join(import.meta.dir, '../test/fixtures/dashboard');
const app = createApp({
  log: createLogger('silent'),
  ids: createIds(systemClock),
  readinessChecks: [],
  dashboardDir: fixture,
});

describe('dashboard serving', () => {
  test.each(['/', '/projects/prj_123/settings'])('%s gets index.html, not cached', async (path) => {
    const response = await app.request(path);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toStartWith('text/html');
    expect(response.headers.get('cache-control')).toBe('no-cache');
    expect(await response.text()).toContain('<div id="root">');
  });

  test('hashed assets are cached for a year', async () => {
    const response = await app.request('/assets/index-abc123.js');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(response.headers.get('content-type')).toStartWith('text/javascript');
    expect(await response.text()).toContain('fixture');
  });

  test('files in the build root are served', async () => {
    const response = await app.request('/favicon.svg');
    expect(response.headers.get('content-type')).toStartWith('image/svg+xml');
  });

  test('a missing asset is a 404, not the SPA', async () => {
    expect((await app.request('/assets/missing.js')).status).toBe(404);
  });

  test.each(['/v1/unknown', '/v1', '/api/auth/nope'])(
    'API path %s never falls back to the SPA',
    async (path) => {
      const response = await app.request(path);
      expect(response.status).toBe(404);
      expect(response.headers.get('content-type')).toBe('application/problem+json');
    },
  );

  test('health routes still win', async () => {
    expect(await (await app.request('/healthz')).json()).toEqual({ status: 'ok' });
  });

  test.each(['/../package.json', '/assets/..%2f..%2fpackage.json', '//etc/passwd'])(
    'path traversal via %s does not escape the build directory',
    async (path) => {
      const body = await (await app.request(path)).text();
      expect(body).not.toContain('"name"');
      expect(body).not.toContain('root:');
    },
  );

  test('POST to a dashboard path is not served the SPA', async () => {
    expect((await app.request('/projects', { method: 'POST' })).status).toBe(404);
  });

  test('findDashboard only reports a built dashboard', () => {
    expect(findDashboard(fixture)).toBe(fixture);
    expect(findDashboard(join(fixture, 'assets'))).toBeNull();
  });
});
