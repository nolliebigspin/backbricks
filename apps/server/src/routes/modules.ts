import {
  AppError,
  type RegisteredRoute,
  type PublicReadContext,
  type PublicWriteContext,
  type TenantTransaction,
  publicWriteEnvelopeSchema,
  honeypotResponseSchema,
  idempotencyKeySchema,
  publishableKeyTokenSchema,
  type PublicCredentialResolver,
} from '@backbricks/core';
import { createRoute, z, type RouteConfig } from '@hono/zod-openapi';
import type { Context } from 'hono';

import type { AppEnv } from '../context.ts';
import type { ApiRoutes } from '../http/api-routes.ts';
import { requireTenantContext } from '../middleware/authorization.ts';
import type { ServerServices } from '../services.ts';
import { publicPreflight } from './public-cors.ts';

const methods = { GET: 'get', POST: 'post', PATCH: 'patch', PUT: 'put', DELETE: 'delete' } as const;
/** P1.9 supplies credential/origin/abuse checks before any public module transaction is opened. */
export type ModulePublicExecutor = (
  context: Context<AppEnv>,
  moduleType: string,
  route: RegisteredRoute,
  run: (
    tx: TenantTransaction,
    input: unknown,
    context?: PublicReadContext | PublicWriteContext,
  ) => Promise<Response>,
) => Promise<Response>;

function responses(route: RegisteredRoute): RouteConfig['responses'] {
  const declarations: RouteConfig['responses'] = Object.fromEntries(
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
  if (route.access?.kind === 'write') {
    const response = route.responses[200];
    if (response && response.kind !== 'json')
      throw new AppError('invalid_request', {
        detail: 'Public write acknowledgements must be JSON.',
      });
    declarations[200] = {
      description: 'Accepted.',
      content: {
        'application/json': {
          schema: response
            ? z.union([response.schema, honeypotResponseSchema])
            : honeypotResponseSchema,
        },
      },
    };
  }
  return declarations;
}

/** Mount selected typed hooks through the same policy/OpenAPI inventory as platform routes. */
export function moduleRoutes(
  api: ApiRoutes,
  services: Pick<ServerServices, 'modules' | 'moduleRuntime' | 'withTenant'>,
  executePublic?: ModulePublicExecutor,
  resolvePublic?: PublicCredentialResolver,
) {
  for (const module of services.modules.registry.modules) {
    if (resolvePublic) {
      const paths = new Set(module.publicRoutes.map((route) => route.path));
      for (const [index, path] of [...paths].entries())
        publicPreflight(api, {
          path: `/v1/public/${module.resourceName.plural}${path === '/' ? '' : path}`,
          operationId: `${module.type}.preflight.${index}`,
          methods: module.publicRoutes
            .filter((route) => route.path === path)
            .map((route) => route.method),
          resolve: resolvePublic,
          withTenant: services.withTenant,
        });
    }
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
          ...(!management && hasBody
            ? { headers: z.object({ 'idempotency-key': idempotencyKeySchema.optional() }) }
            : {}),
          params: management
            ? route.input.shape.params.extend({ projectId: z.string() })
            : route.input.shape.params,
          query: management
            ? route.input.shape.query
            : route.input.shape.query.extend({ key: publishableKeyTokenSchema.optional() }),
          ...(hasBody
            ? {
                body: {
                  required: true,
                  content: {
                    'application/json': {
                      schema: management
                        ? route.input.shape.body
                        : publicWriteEnvelopeSchema(route.input.shape.body),
                    },
                  },
                },
              }
            : {}),
        },
        responses: responses(route),
      });
      api.register(
        definition,
        route.policy,
        async (c) => {
          const run = (
            tx: TenantTransaction,
            input: unknown,
            context?: PublicReadContext | PublicWriteContext,
          ) =>
            route.run(
              {
                ...services.moduleRuntime.forTenant(tx).execution(module.type),
                ...(context
                  ? 'spam' in context
                    ? { publicWrite: context }
                    : { publicRead: context }
                  : {}),
              },
              input,
            );
          if (!management) {
            if (!executePublic) throw new AppError('service_unavailable');
            return executePublic(c, module.type, route, run);
          }
          const input = {
            params: c.req.param(),
            query: Object.fromEntries(
              Object.entries(c.req.queries()).map(([name, values]) => [
                name,
                values.length === 1 ? values[0] : values,
              ]),
            ),
            body: hasBody ? await c.req.json<unknown>() : null,
          };
          return services.withTenant(requireTenantContext(c), (tx) => run(tx, input));
        },
        { deferPublicBodyValidation: !management && hasBody },
      );
    }
  }
}
