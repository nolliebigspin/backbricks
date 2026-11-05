import { AppError } from '@backbricks/core';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';

import type { AppDependencies, AppEnv } from './context.ts';
import { handleError, handleNotFound } from './errors.ts';
import { healthRoutes } from './health.ts';
import { requestContext } from './middleware/request-context.ts';

/** Default request body limit; public routes set tighter ones per module (ARCHITECTURE §D.5). */
export const DEFAULT_BODY_LIMIT_BYTES = 1024 * 1024;

/** The HTTP app. Wiring only: routes and services come from the composition root. */
export function createApp(deps: AppDependencies): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use(requestContext(deps.log, deps.ids));
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

  app.onError(handleError);
  app.notFound(handleNotFound);
  return app;
}
