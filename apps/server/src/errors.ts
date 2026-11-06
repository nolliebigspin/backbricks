import { AppError, toProblemDetails } from '@backbricks/core';
import type { Context, ErrorHandler, NotFoundHandler } from 'hono';

import type { AppEnv } from './context.ts';

export function problemResponse(c: Context<AppEnv>, error: AppError): Response {
  return c.body(JSON.stringify(toProblemDetails(error, c.get('requestId'))), {
    status: error.status,
    headers: { 'Content-Type': 'application/problem+json' },
  });
}

/**
 * Every error leaves the API as RFC 9457 problem details (ARCHITECTURE §D.3). Unexpected
 * errors are logged in full and answered with a generic 500: no message, no stack.
 */
export const handleError: ErrorHandler<AppEnv> = (error, c) => {
  if (error instanceof AppError) return problemResponse(c, error);
  c.get('log').error({ err: error }, 'unhandled error');
  return problemResponse(c, new AppError('internal_error'));
};

export const handleNotFound: NotFoundHandler<AppEnv> = (c) =>
  problemResponse(
    c,
    new AppError('not_found', { detail: `No route for ${c.req.method} ${c.req.path}.` }),
  );
