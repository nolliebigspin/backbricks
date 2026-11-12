import { AUTH_BODY_LIMIT_BYTES } from '@backbricks/auth';
import { AppError, DEFAULT_BODY_LIMIT_BYTES } from '@backbricks/core';
import { createRoute, z } from '@hono/zod-openapi';
import { bodyLimit } from 'hono/body-limit';

import type { AppDependencies } from './context.ts';
import { dashboardRoutes } from './dashboard.ts';
import { handleError, handleNotFound, moduleAwareNotFound } from './errors.ts';
import { healthRoutes } from './health.ts';
import { ApiRoutes, type ApiAuthorization, createOpenApiApp } from './http/api-routes.ts';
import { apiDocument } from './http/openapi-document.ts';
import { clientIdentity } from './middleware/client-identity.ts';
import { requestContext } from './middleware/request-context.ts';

/** The HTTP app. Wiring only: routes and services come from the composition root. */
export function createApp(
  deps: AppDependencies,
  configureApi: (api: ApiRoutes) => void = () => {},
  authorize?: ApiAuthorization,
) {
  const app = createOpenApiApp();

  app.use(requestContext(deps.log, deps.ids));
  if (deps.ipIdentity) app.use(clientIdentity(deps.ipIdentity));
  app.use(
    bodyLimit({
      maxSize: DEFAULT_BODY_LIMIT_BYTES,
      onError: () => {
        throw new AppError('payload_too_large', {
          detail: `The request body exceeds ${DEFAULT_BODY_LIMIT_BYTES} bytes.`,
        });
      },
    }),
  );

  app.route('/', healthRoutes(deps.readinessChecks));
  if (deps.auth) {
    const auth = deps.auth;
    app.use(
      `${auth.basePath}/*`,
      bodyLimit({
        maxSize: AUTH_BODY_LIMIT_BYTES,
        onError: () => {
          throw new AppError('payload_too_large');
        },
      }),
    );
    app.all(`${auth.basePath}/*`, (c) => {
      const ipHash = c.get('ipHash');
      if (!ipHash) throw new AppError('service_unavailable');
      return auth.handle(c.req.raw, ipHash);
    });
  }
  const api = new ApiRoutes(app, authorize, deps.rateLimiter);
  api.register(
    createRoute({
      method: 'get',
      path: '/v1/openapi.json',
      operationId: 'getOpenApiDocument',
      responses: {
        200: {
          description: 'The public API contract.',
          content: { 'application/json': { schema: z.record(z.string(), z.unknown()) } },
        },
      },
    }),
    { kind: 'public', bodyLimitBytes: DEFAULT_BODY_LIMIT_BYTES },
    (c) => c.json(apiDocument(app), 200),
  );
  configureApi(api);
  api.finalize();
  // API routes are mounted above this line; the dashboard catches the remaining GETs.
  if (deps.dashboardDir !== null) app.route('/', dashboardRoutes(deps.dashboardDir));

  app.onError(handleError);
  app.notFound(deps.modules ? moduleAwareNotFound(deps.modules) : handleNotFound);
  api.assertCoverage();
  return Object.assign(app, { apiRoutes: api });
}
