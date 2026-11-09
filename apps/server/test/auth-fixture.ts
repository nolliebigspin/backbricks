import {
  loadConfig,
  formatConfigIssues,
  createIpIdentity,
  type Config,
  type Clock,
  type SecretKeyResolver,
  type SecretKeyLookup,
  type defineModuleCatalog,
} from '@backbricks/core';
import {
  createPublishableKeyLookup,
  createDatabase,
  createPostgresQueue,
  runMigrations,
} from '@backbricks/db';
import { z } from '@hono/zod-openapi';

import { createTestDatabase, postgresAvailable } from '../../../scripts/test/database.ts';
import { mailpitAvailable, receivedMail, TEST_SMTP_URL } from '../../../scripts/test/mailpit.ts';
import { createApp } from '../src/app.ts';
import { createServerAuth } from '../src/auth.ts';
import type { ApiRoutes } from '../src/http/api-routes.ts';
import { createServerKeyAuth } from '../src/key-auth.ts';
import { createLogger } from '../src/logger.ts';
import { createApiAuthorization } from '../src/middleware/authorization.ts';
import { moduleJobDefinitions } from '../src/module-jobs.ts';
import { moduleCatalog } from '../src/modules.ts';
import { createServerOutbox } from '../src/outbox.ts';
import { createPublicCredentialResolver } from '../src/public-auth.ts';
import type { ModulePublicExecutor } from '../src/routes/modules.ts';
import { platformRoutes } from '../src/routes/platform.ts';
import { createServerServices } from '../src/services.ts';

export const available = (await postgresAvailable()) && (await mailpitAvailable());
export const AUTH_TEST_SECRET = 'auth-test-only-not-a-real-secret-000000000000';
export const idResponseSchema = z.object({ id: z.string() });

export async function scenario(
  run: (fixture: {
    request: (
      path: string,
      body?: unknown,
      cookie?: string,
      headers?: NonNullable<RequestInit['headers']>,
      method?: string,
    ) => Promise<Response>;
    db: ReturnType<typeof createDatabase>['db'];
    logs: string[];
    origin: string;
    now: () => Date;
    manifest: () => ApiRoutes['manifest'];
    jobs: () => ReturnType<typeof createServerServices>['jobs'];
    instances: () => ReturnType<typeof createServerServices>['instances'];
    authInventory: () => Promise<{ path: string; method: string }[]>;
    drainSecurity: () => Promise<void>;
    dispatchOutbox: () => Promise<void>;
    capabilities: (values: Pick<Config, 'mailer' | 'signupPolicy'>) => Promise<void>;
  }) => Promise<void>,
  overrides: Record<string, string> = {},
  apiOptions: {
    durableDelivery?: boolean;
    consumeJobs?: boolean;
    configure?: (api: ApiRoutes, db: ReturnType<typeof createDatabase>['db']) => void;
    resolveKey?: SecretKeyResolver;
    lookupPublishable?: SecretKeyLookup;
    keyClock?: Clock;
    catalog?: ReturnType<typeof defineModuleCatalog>;
    moduleRepositories?: NonNullable<
      Parameters<typeof createServerServices>[2]
    >['moduleRepositories'];
    executePublic?: ModulePublicExecutor;
    entitlements?: NonNullable<Parameters<typeof createServerServices>[2]>['entitlements'];
  } = {},
) {
  const catalog = apiOptions.catalog ?? moduleCatalog;
  const database = await createTestDatabase();
  await runMigrations(database.url);
  const handle = createDatabase(database.url);
  const logs: string[] = [];
  let auth: ReturnType<typeof createServerAuth> | undefined;
  let keyAuth: ReturnType<typeof createServerKeyAuth> | undefined;
  let services: ReturnType<typeof createServerServices> | undefined;
  let app: ReturnType<typeof createApp> | undefined;
  let queue: ReturnType<typeof createPostgresQueue> | undefined;
  let outbox: ReturnType<typeof createServerOutbox> | undefined;
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
      catalog.available,
    );
    if (!result.ok) throw new Error(formatConfigIssues(result.issues));
    const log = createLogger('debug', { write: (line) => logs.push(line) });
    const mount = async (config: Config) => {
      const modules = catalog.select(config.modules);
      if (apiOptions.durableDelivery) {
        queue = createPostgresQueue(
          handle.db,
          moduleJobDefinitions(modules),
          (name) => log.warn({ job: name }, 'queue operation failed'),
          apiOptions.keyClock,
        );
        await queue.start();
      }
      const runtime = createServerServices(config, handle.db, {
        clock: apiOptions.keyClock,
        entitlements: apiOptions.entitlements,
        modules,
        queue: queue?.queue,
        enqueueProject: queue?.enqueueProject,
        enqueueNotificationMail: queue?.enqueueNotificationMail,
        projectErasure: queue?.projectErasure,
        moduleRepositories: apiOptions.moduleRepositories,
      });
      services = runtime;
      auth = createServerAuth(config, handle.db, log, runtime, queue);
      keyAuth = createServerKeyAuth(config, handle.db, log, runtime, apiOptions.durableDelivery);
      if (queue) {
        if (apiOptions.consumeJobs !== false) await queue.consume(runtime.jobs, runtime.withTenant);
        await queue.consumeMail(runtime.container.optional('mailer'));
        outbox = createServerOutbox(config, handle.db, runtime, queue);
      }
      const resolvePublic = createPublicCredentialResolver({
        clock: runtime.container.core.clock,
        withTenant: runtime.withTenant,
        resolveSecret: keyAuth.resolveKey,
        lookupPublishable: apiOptions.lookupPublishable ?? createPublishableKeyLookup(handle.db),
      });
      app = createApp(
        {
          log,
          auth,
          ids: runtime.container.core.ids,
          rateLimiter: runtime.container.core.rateLimiter,
          modules: runtime.modules,
          dashboardDir: null,
          readinessChecks: runtime.readinessChecks,
          ipIdentity: createIpIdentity({
            appSecret: config.appSecret,
            clock: runtime.container.core.clock,
            trustedProxies: [],
          }),
        },
        (api) => {
          platformRoutes(api, runtime, { resolvePublic, executePublic: apiOptions.executePublic });
          apiOptions.configure?.(api, handle.db);
        },
        createApiAuthorization({
          config,
          db: handle.db,
          auth,
          resolveKey: apiOptions.resolveKey ?? keyAuth.resolveKey,
        }),
      );
    };
    await mount(result.config);
    await run({
      db: handle.db,
      origin,
      now: () => {
        if (!services) throw new Error('Expected runtime services');
        return services.container.core.clock.now();
      },
      logs,
      jobs: () => {
        if (!services) throw new Error('Expected runtime services');
        return services.jobs;
      },
      instances: () => {
        if (!services) throw new Error('Expected runtime services');
        return services.instances;
      },
      manifest: () => {
        if (!app) throw new Error('Expected mounted fixture');
        return app.apiRoutes.manifest;
      },
      authInventory: () => {
        if (!auth) throw new Error('Expected mounted authentication');
        return auth.organizationEndpointInventory();
      },
      dispatchOutbox: async () => {
        await outbox?.tick();
      },
      drainSecurity: async () => {
        await keyAuth?.drain();
      },
      capabilities: async (values) => {
        await keyAuth?.close();
        await auth?.close();
        await queue?.stop();
        await services?.close();
        await mount({ ...result.config, ...values });
      },
      request: (path, body, cookie, extraHeaders, method = body === undefined ? 'GET' : 'POST') => {
        const headers = new Headers(extraHeaders);
        if (!['GET', 'HEAD'].includes(method)) {
          if (!headers.has('origin'))
            headers.set('origin', new URL(result.config.publicUrl).origin);
          if (!headers.has('x-backbricks-csrf')) headers.set('x-backbricks-csrf', '1');
          if (body !== undefined) headers.set('content-type', 'application/json');
        }
        if (cookie) headers.set('cookie', cookie);
        return fetch(`${origin}${path.startsWith('/v1/') ? path : `/api/auth${path}`}`, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          redirect: 'manual',
        });
      },
    });
  } finally {
    await server.stop(true);
    await keyAuth?.close();
    await auth?.close();
    await queue?.stop();
    await services?.close();
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

export type AuthFixture = Parameters<Parameters<typeof scenario>[0]>[0];
/** Real registration and email verification, shared by organization/isolation scenarios. */
export async function createVerifiedUser(fixture: AuthFixture) {
  const email = `member-${crypto.randomUUID()}@example.invalid`;
  const credentials = { email, password: 'a-long-test-password-1234' };
  const signup = await fixture.request('/sign-up/email', { ...credentials, name: 'Fixture' });
  if (signup.status !== 200) throw new Error(`Registration failed: ${signup.status}`);
  const link = actionLink((await receivedMail(email)).HTML);
  const verification = await fixture.request(`/verify-email${link.search}`);
  if (verification.status !== 302) throw new Error(`Verification failed: ${verification.status}`);
  const signin = await fixture.request('/sign-in/email', credentials);
  if (signin.status !== 200) throw new Error(`Sign-in failed: ${signin.status}`);
  const body = z.object({ user: z.object({ id: z.string() }) }).parse(await signin.json());
  return { id: body.user.id, email, cookie: cookies(signin) };
}
