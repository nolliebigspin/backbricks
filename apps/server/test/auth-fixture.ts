import {
  loadConfig,
  formatConfigIssues,
  createIds,
  createIpIdentity,
  systemClock,
} from '@backbricks/core';
import { createDatabase, runMigrations } from '@backbricks/db';

import { createTestDatabase, postgresAvailable } from '../../../scripts/test/database.ts';
import { mailpitAvailable, TEST_SMTP_URL } from '../../../scripts/test/mailpit.ts';
import { createApp } from '../src/app.ts';
import { createServerAuth } from '../src/auth.ts';
import { createLogger } from '../src/logger.ts';

export const available = (await postgresAvailable()) && (await mailpitAvailable());
export const AUTH_TEST_SECRET = 'auth-test-only-not-a-real-secret-000000000000';

export async function scenario(
  run: (fixture: {
    request: (
      path: string,
      body?: unknown,
      cookie?: string,
      headers?: NonNullable<RequestInit['headers']>,
    ) => Promise<Response>;
    db: ReturnType<typeof createDatabase>['db'];
    logs: string[];
    origin: string;
  }) => Promise<void>,
  overrides: Record<string, string> = {},
) {
  const database = await createTestDatabase();
  await runMigrations(database.url);
  const handle = createDatabase(database.url);
  const logs: string[] = [];
  let auth: ReturnType<typeof createServerAuth> | undefined;
  let app: ReturnType<typeof createApp> | undefined;
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: (request, connection) =>
      app?.fetch(request, connection) ?? new Response(null, { status: 503 }),
  });
  const origin = server.url.origin;
  try {
    const result = loadConfig(
      {
        NODE_ENV: 'test',
        DATABASE_URL: database.url,
        APP_SECRET: AUTH_TEST_SECRET,
        PUBLIC_URL: origin,
        BACKBRICKS_MODULES: 'forms',
        SIGNUP_POLICY: 'open',
        SMTP_URL: TEST_SMTP_URL,
        MAIL_FROM: 'noreply@example.invalid',
        ...overrides,
      },
      { forms: [] },
    );
    if (!result.ok) throw new Error(formatConfigIssues(result.issues));
    const log = createLogger('debug', { write: (line) => logs.push(line) });
    auth = createServerAuth(result.config, handle.db, log);
    app = createApp({
      log,
      auth,
      ids: createIds(systemClock),
      dashboardDir: null,
      readinessChecks: [],
      ipIdentity: createIpIdentity({
        appSecret: result.config.appSecret,
        clock: systemClock,
        trustedProxies: [],
      }),
    });
    await run({
      db: handle.db,
      origin,
      logs,
      request: (path, body, cookie, extraHeaders) => {
        const headers = new Headers(extraHeaders);
        if (body !== undefined) {
          if (!headers.has('origin'))
            headers.set('origin', new URL(result.config.publicUrl).origin);
          if (!headers.has('x-backbricks-csrf')) headers.set('x-backbricks-csrf', '1');
          headers.set('content-type', 'application/json');
        }
        if (cookie) headers.set('cookie', cookie);
        return fetch(`${origin}/api/auth${path}`, {
          method: body === undefined ? 'GET' : 'POST',
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          redirect: 'manual',
        });
      },
    });
  } finally {
    await server.stop(true);
    await auth?.close();
    await handle.close();
    await database.drop();
  }
}

export function cookies(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ');
}
export function actionLink(html: string): URL {
  const match = /href="([^"]+)"/.exec(html);
  if (!match?.[1]) throw new Error('Expected one action link');
  return new URL(match[1].replaceAll('&amp;', '&'));
}
