import { expect, test } from 'bun:test';

import { createIds, createIpIdentity, systemClock } from '@backbricks/core';

import { createApp } from '../app.ts';
import { createLogger } from '../logger.ts';

test('socket-derived request identity ignores forged headers and never logs clear addresses', async () => {
  const lines: string[] = [];
  const identity = createIpIdentity({
    appSecret: 'fixture-secret',
    clock: systemClock,
    trustedProxies: [],
  });
  const app = createApp({
    log: createLogger('info', { write: (line) => lines.push(line) }),
    ids: createIds(systemClock),
    ipIdentity: identity,
    readinessChecks: [],
    dashboardDir: null,
  });
  // Test-only endpoint observes the context value without adding it to the production API.
  app.get('/identity-fixture', (c) => c.text(c.get('ipHash') ?? 'missing'));
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: app.fetch });
  try {
    const response = await fetch(new URL('/identity-fixture', server.url), {
      headers: { 'x-forwarded-for': '198.51.100.1' },
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(identity('127.0.0.1', new Headers()));
    expect(lines.join('')).not.toContain('127.0.0.1');
    expect(lines.join('')).not.toContain('198.51.100.1');
  } finally {
    await server.stop(true);
  }
});
