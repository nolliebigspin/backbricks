import { authLogPath } from '@backbricks/auth';
import type { Ids } from '@backbricks/core';
import type { MiddlewareHandler } from 'hono';

import type { AppEnv } from '../context.ts';
import type { Logger } from '../logger.ts';

// Accept a caller's request ID (e.g. from a reverse proxy) only if it's short and harmless.
const INCOMING_REQUEST_ID = /^[A-Za-z0-9_.-]{1,128}$/;

/**
 * Assigns the request ID (`X-Request-Id`, echoed in every response and problem), a child
 * logger bound to it, and one access log line per request. The access log records the path
 * without the query string: public routes may carry a publishable key in `?key=`.
 */
export function requestContext(log: Logger, ids: Ids): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const incoming = c.req.header('x-request-id');
    const requestId =
      incoming !== undefined && INCOMING_REQUEST_ID.test(incoming) ? incoming : ids.generate('req');
    const requestLog = log.child({ requestId });
    c.set('requestId', requestId);
    c.set('log', requestLog);
    c.header('X-Request-Id', requestId);

    const started = performance.now();
    await next();
    requestLog.info(
      {
        method: c.req.method,
        path: authLogPath(c.req.path),
        status: c.res.status,
        durationMs: Math.round(performance.now() - started),
      },
      'request',
    );
  };
}
