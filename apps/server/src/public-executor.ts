import {
  AppError,
  createAbuseGuard,
  publicRequestCredential,
  type PublicCredentialResolver,
} from '@backbricks/core';

import type { ModulePublicExecutor } from './routes/modules.ts';
import type { ServerServices } from './services.ts';

/** The host binds credentials, transport and the module's transaction without granting management access. */
export function createPublicExecutor(
  services: ServerServices,
  resolve: PublicCredentialResolver,
): ModulePublicExecutor {
  const guard = createAbuseGuard({
    ...services.container.core,
    captcha: services.captcha,
    limiter: services.container.core.rateLimiter,
    withTenant: services.withTenant,
  });
  return async (c, type, route, run) => {
    c.header('Cache-Control', 'no-store');
    c.header('Vary', 'Origin');
    const request = {
      origin: c.req.header('origin') ?? null,
      ipHash: c.get('ipHash'),
      requestId: c.get('requestId'),
    };
    const credential = publicRequestCredential(c.req.raw.headers, c.req.query('key'));
    const identity = await resolve(credential, request);
    if (!identity) throw new AppError('not_found');
    const module = services.modules.registry.get(type);
    if (!module) throw new AppError('not_found');
    const query = Object.fromEntries(
      Object.entries(c.req.queries())
        .filter(([name]) => name !== 'key')
        .map(([name, values]) => [name, values.length === 1 ? values[0] : values]),
    );
    const response = await guard({
      identity,
      request,
      module,
      route,
      params: c.req.param(),
      query,
      run,
      allowOrigin(origin) {
        c.header('Access-Control-Allow-Origin', origin);
        c.header('Vary', 'Origin');
      },
      async body() {
        if (
          !c.req
            .header('content-type')
            ?.split(';')[0]
            ?.trim()
            .toLowerCase()
            .endsWith('application/json')
        )
          throw new AppError('invalid_request');
        return new Uint8Array(await c.req.arrayBuffer());
      },
    });
    return c.newResponse(response.body, response);
  };
}
