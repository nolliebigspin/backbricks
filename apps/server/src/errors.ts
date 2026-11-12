import {
  AppError,
  toProblemDetails,
  unavailableModuleAtPath,
  publicFormFailure,
  type SelectedModules,
} from '@backbricks/core';
import type { Context, ErrorHandler, NotFoundHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';

import type { AppEnv } from './context.ts';

export function problemResponse(c: Context<AppEnv>, error: AppError): Response {
  const form = c.get('publicForm');
  if (form) {
    const response = publicFormFailure(error, form);
    return c.newResponse(response.body, response);
  }
  return c.body(JSON.stringify(toProblemDetails(error, c.get('requestId'))), {
    status: error.status,
    headers: { 'Content-Type': 'application/problem+json' },
  });
}

/**
 * Every error leaves the API as RFC 9457 problem details (ARCHITECTURE §D.3). Unexpected
 * errors retain redacted diagnostics and receive a generic 500: no message, no stack.
 */
export const handleError: ErrorHandler<AppEnv> = (error, c) => {
  if (error instanceof AppError) return problemResponse(c, error);
  if (error instanceof HTTPException && (error.status === 400 || error.status === 415)) {
    return problemResponse(
      c,
      new AppError(error.status === 400 ? 'invalid_request' : 'unsupported_media_type'),
    );
  }
  c.get('log').error({ err: error }, 'unhandled error');
  return problemResponse(c, new AppError('internal_error'));
};

export const handleNotFound: NotFoundHandler<AppEnv> = (c) =>
  problemResponse(c, new AppError('not_found', { detail: 'No route matches this request.' }));

/** Known unavailable module paths expose only the installation-wide metadata already public at /meta. */
export function moduleAwareNotFound(modules: SelectedModules): NotFoundHandler<AppEnv> {
  return (c) =>
    unavailableModuleAtPath(modules, c.req.path)
      ? problemResponse(
          c,
          new AppError('module_not_enabled', {
            hint: 'Enable an implemented module to use this API.',
          }),
        )
      : handleNotFound(c);
}
