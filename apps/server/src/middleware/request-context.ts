import { authLogPath } from '@backbricks/auth';
import { API_KEY_PREFIXES, AUTH_BASE_PATH, type Ids } from '@backbricks/core';
import type { MiddlewareHandler } from 'hono';
import { routePath } from 'hono/route';

import type { AppEnv } from '../context.ts';
import type { Logger } from '../logger.ts';

// Accept a caller's request ID (e.g. from a reverse proxy) only if it's short and harmless.
const INCOMING_REQUEST_ID = /^[A-Za-z0-9_.-]{1,128}$/;

/**
 * Assigns the request ID (`X-Request-Id`, echoed in every response and problem), a child
 * logger bound to it, and one access log line per request. Route templates avoid logging
 * user-controlled identifiers, filenames, credentials or query parameters.
 */
export function requestContext(log: Logger, ids: Ids): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const incoming = c.req.header('x-request-id');
    const requestId =
      incoming !== undefined &&
      INCOMING_REQUEST_ID.test(incoming) &&
      !incoming.includes(API_KEY_PREFIXES.secret)
        ? incoming
        : ids.generate('req');
    const requestLog = log.child({ requestId });
    c.set('requestId', requestId);
    c.set('log', requestLog);
    c.header('X-Request-Id', requestId);

    const started = performance.now();
    await next();
    requestLog.info(
      {
        method: c.req.method,
        path: c.req.path.startsWith(`${AUTH_BASE_PATH}/`)
          ? authLogPath(c.req.path)
          : routePath(c) || '[unmatched]',
        status: c.res.status,
        durationMs: Math.round(performance.now() - started),
      },
      'request',
    );
  };
}
