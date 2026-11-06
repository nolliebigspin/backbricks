import {
  AppError,
  problemDetailsSchema,
  routePolicySchema,
  type RoutePolicy,
} from '@backbricks/core';
import { OpenAPIHono, type RouteConfig, type RouteHandler } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';

import type { AppEnv } from '../context.ts';

export type ApiAuthorization = (
  policy: Extract<RoutePolicy, { kind: 'management' }>,
  context: Context<AppEnv>,
  tenant: TenantPathSelector,
) => void | Promise<void>;

export type TenantPathSelector = Readonly<{ organizationParam?: string; projectParam?: string }>;
type RegisteredRoute = Readonly<{
  method: string;
  path: string;
  policy: RoutePolicy;
  tenant: TenantPathSelector;
}>;
type RuntimeRoute = OpenAPIHono<AppEnv>['routes'][number];

/** A declared API surface; bypasses are detected against Hono's actual registered handlers. */
export class ApiRoutes {
  readonly #app: OpenAPIHono<AppEnv>;
  readonly #authorize: ApiAuthorization;
  readonly #handlers = new Set<RuntimeRoute>();
  readonly #manifest: RegisteredRoute[] = [];
  readonly #operations = new Set<string>();
  readonly #operationIds = new Set<string>();

  constructor(
    app: OpenAPIHono<AppEnv>,
    authorize: ApiAuthorization = () => {
      throw new AppError('service_unavailable');
    },
  ) {
    this.#app = app;
    this.#authorize = authorize;
    const start = app.routes.length;
    app.use('/v1/*', async (_c, next) => {
      this.assertCoverage();
      await next();
    });
    for (const route of app.routes.slice(start)) this.#handlers.add(route);
  }

  get manifest(): readonly RegisteredRoute[] {
    return Object.freeze(structuredClone(this.#manifest));
  }

  /** Registers validation, authorization and body policy before the typed HTTP handler. */
  register<R extends RouteConfig>(
    route: R,
    policy: RoutePolicy,
    handler: RouteHandler<R, AppEnv>,
  ): void {
    const parsed = routePolicySchema.parse(policy);
    if (!route.path.startsWith('/v1/') || route.hide) {
      throw new Error('API routes must be visible OpenAPI operations under /v1/.');
    }
    const method = route.method.toUpperCase();
    const tenant = Object.freeze({
      organizationParam: /\/organizations\/\{([^}]+)\}/.exec(route.path)?.[1],
      projectParam: /\/projects\/\{([^}]+)\}/.exec(route.path)?.[1],
    });
    if (parsed.kind === 'management' && parsed.secretKey && !tenant.projectParam) {
      throw new Error('Secret-key management routes must be project-scoped.');
    }
    const key = `${method} ${route.path.replaceAll(/\{[^}]+\}/g, '{}')}`;
    if (this.#operations.has(key)) throw new Error(`Duplicate API operation: ${key}`);
    if (route.operationId && this.#operationIds.has(route.operationId))
      throw new Error(`Duplicate API operation ID: ${route.operationId}`);
    const start = this.#app.routes.length;
    const path = route.path.replaceAll(/\{([^}]+)\}/g, ':$1');
    const limit = bodyLimit({
      maxSize: parsed.bodyLimitBytes,
      onError: () => {
        throw new AppError('payload_too_large');
      },
    });
    this.#app.use(path, async (c, next) => {
      if (c.req.method !== method && !(c.req.method === 'HEAD' && method === 'GET')) return next();
      if (parsed.kind === 'management') {
        c.header('Cache-Control', 'no-store');
        await this.#authorize(parsed, c, tenant);
      }
      await limit(c, next);
      if (parsed.kind === 'management') c.header('Cache-Control', 'no-store');
    });
    this.#app.openapi(
      {
        ...route,
        responses: {
          default: {
            description: 'A structured API error.',
            content: { 'application/problem+json': { schema: problemDetailsSchema } },
          },
          ...route.responses,
        },
      },
      handler,
    );
    for (const registered of this.#app.routes.slice(start)) this.#handlers.add(registered);
    this.#operations.add(key);
    if (route.operationId) this.#operationIds.add(route.operationId);
    this.#manifest.push(
      Object.freeze({
        method: route.method.toUpperCase(),
        path: route.path,
        policy: parsed,
        tenant,
      }),
    );
  }

  /** Fails when a raw HTTP registration bypasses policy, including duplicate-path handlers. */
  assertCoverage(): void {
    for (const route of this.#app.routes) {
      if ((route.path === '/v1' || route.path.startsWith('/v1/')) && !this.#handlers.has(route)) {
        throw new Error(`Undeclared API handler: ${route.method} ${route.path}`);
      }
    }
  }
}

/** Validation failures use the same RFC 9457 contract without echoing untrusted values. */
export function createOpenApiApp(): OpenAPIHono<AppEnv> {
  return new OpenAPIHono<AppEnv>({
    defaultHook: (result) => {
      if (!result.success) {
        throw new AppError('validation_failed', {
          errors: result.error.issues.map((issue) => ({
            path: issue.path.map(String).join('.'),
            code: issue.code,
            message: 'Invalid value.',
          })),
        });
      }
    },
  });
}
