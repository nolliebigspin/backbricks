import {
  AppError,
  createAbuseGuard,
  publicRequestCredential,
  refererPath,
  userAgentFamily,
  type PublicCredentialResolver,
} from '@backbricks/core';

import type { ModulePublicExecutor } from './routes/modules.ts';
import type { ServerServices } from './services.ts';

const PUBLIC_RESPONSE_VARY = 'Origin, Authorization';

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
    c.header('Vary', PUBLIC_RESPONSE_VARY);
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
      idempotencyKey: c.req.header('idempotency-key'),
      request,
      module,
      route,
      params: c.req.param(),
      query,
      transport: c.get('publicForm') ? 'form' : 'json',
      formReady: (redirects) => c.set('publicForm', redirects),
      run,
      source: {
        path: refererPath(c.req.header('referer')),
        uaFamily: userAgentFamily(c.req.header('user-agent')),
      },
      allowOrigin(origin) {
        c.header('Access-Control-Allow-Origin', origin);
        c.header('Vary', PUBLIC_RESPONSE_VARY);
      },
      async body() {
        if (
          !c.get('publicForm') &&
          c.req.header('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json'
        )
          throw new AppError('unsupported_media_type');
        return new Uint8Array(await c.req.arrayBuffer());
      },
    });
    const form = c.get('publicForm');
    if (form?.success) {
      return c.newResponse(null, {
        status: 303,
        headers: {
          Location: form.success,
          'Cache-Control': 'no-store',
          'Referrer-Policy': 'no-referrer',
        },
      });
    }
    // A route may allow caching (e.g. a public form schema); everything else stays uncached.
    c.header('Cache-Control', response.headers.get('cache-control') ?? 'no-store');
    return c.newResponse(response.body, response);
  };
}
