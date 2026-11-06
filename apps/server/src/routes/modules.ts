import { AppError, type RegisteredRoute, type TenantContext } from '@backbricks/core';
import { createRoute, z, type RouteConfig } from '@hono/zod-openapi';
import type { Context } from 'hono';

import type { AppEnv } from '../context.ts';
import type { ApiRoutes } from '../http/api-routes.ts';
import { requireTenantContext } from '../middleware/authorization.ts';
import type { ServerServices } from '../services.ts';

const methods = { GET: 'get', POST: 'post', PATCH: 'patch', PUT: 'put', DELETE: 'delete' } as const;
/** P1.9 supplies credential/origin/abuse checks before any public module transaction is opened. */
export type ModulePublicAuthorization = (
  context: Context<AppEnv>,
  moduleType: string,
  route: RegisteredRoute,
) => Promise<TenantContext>;

function responses(route: RegisteredRoute): RouteConfig['responses'] {
  return Object.fromEntries(
    Object.entries(route.responses).map(([status, response]) => {
      const content =
        response.kind === 'json'
          ? { 'application/json': { schema: response.schema } }
          : response.kind === 'csv'
            ? { 'text/csv': { schema: z.string() } }
            : undefined;
      return [status, { description: response.description, ...(content ? { content } : {}) }];
    }),
  );
}

/** Mount selected typed hooks through the same policy/OpenAPI inventory as platform routes. */
export function moduleRoutes(
  api: ApiRoutes,
  services: Pick<ServerServices, 'modules' | 'moduleRuntime' | 'withTenant'>,
  authorizePublic?: ModulePublicAuthorization,
) {
  for (const module of services.modules.registry.modules) {
    for (const route of [...module.adminRoutes, ...module.publicRoutes]) {
      if (/\{(?:projectId|organizationId)\}/.test(route.path))
        throw new AppError('invalid_request', {
          detail: 'A module route cannot shadow a tenant selector.',
        });
      const management = route.policy.kind === 'management';
      const prefix = management
        ? `/v1/projects/{projectId}/${module.resourceName.plural}`
        : `/v1/public/${module.resourceName.plural}`;
      const path = `${prefix}${route.path === '/' ? '' : route.path}`;
      const hasBody = route.method !== 'GET';
      const definition = createRoute({
        method: methods[route.method],
        path,
        operationId: route.operationId,
        request: {
          params: management
            ? route.input.shape.params.extend({ projectId: z.string() })
            : route.input.shape.params,
          query: route.input.shape.query,
          ...(hasBody
            ? {
                body: {
                  required: true,
                  content: { 'application/json': { schema: route.input.shape.body } },
                },
              }
            : {}),
        },
        responses: responses(route),
      });
      api.register(definition, route.policy, async (c) => {
        if (!management && !authorizePublic) throw new AppError('service_unavailable');
        const tenant = management
          ? requireTenantContext(c)
          : await authorizePublic?.(c, module.type, route);
        if (!tenant) throw new AppError('unauthorized');
        const input = {
          // Give the contract raw values so schema transforms run once for the domain callback.
          params: c.req.param(),
          query: Object.fromEntries(
            Object.entries(c.req.queries()).map(([name, values]) => [
              name,
              values.length === 1 ? values[0] : values,
            ]),
          ),
          body: hasBody ? await c.req.json<unknown>() : null,
        };
        const response = await services.withTenant(tenant, (tx) =>
          route.run(services.moduleRuntime.forTenant(tx).execution(module.type), input),
        );
        return response;
      });
    }
  }
}
