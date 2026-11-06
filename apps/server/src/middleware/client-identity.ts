import type { createIpIdentity } from '@backbricks/core';
import type { MiddlewareHandler } from 'hono';
import { getConnInfo } from 'hono/bun';

import type { AppEnv } from '../context.ts';

/** Resolve from the socket, hash immediately, and put only the rotating hash in request context. */
export function clientIdentity(
  identity: ReturnType<typeof createIpIdentity>,
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    c.set('ipHash', identity(getConnInfo(c).remote.address, c.req.raw.headers));
    await next();
  };
}
