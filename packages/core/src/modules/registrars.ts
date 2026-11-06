import { z } from 'zod';

import { publicAccessSchema, type PublicAccessInput } from '../abuse/policy.ts';
import { AppError } from '../errors/app-error.ts';
import { routePolicySchema, type RoutePolicy } from '../http/route-policy.ts';
import { redactSecretText } from '../logging/redact.ts';
import { activityNameSchema } from '../platform/activity-fields.ts';
import type { ModuleExecution } from './contract.ts';
import { MAX_JOB_RETENTION_SECONDS, type ModuleJobRegistrar } from './jobs.ts';
import type { RegisteredJob, RegisteredRoute } from './registered.ts';
import type { ModuleInputSchema, ModuleRouteSpec } from './routes.ts';
import { freezeDeclaration, schemaDocument } from './validation.ts';

async function validateResponse(
  response: Response,
  spec: RegisteredRoute['responses'],
): Promise<Response> {
  const declared = spec[response.status];
  if (!declared)
    throw new AppError('internal_error', {
      detail: 'Module returned an undeclared response status.',
    });
  const headers = new Headers(response.headers);
  if (declared.kind === 'json') {
    const output = declared.schema.safeParse(await response.json());
    if (!output.success) throw new AppError('internal_error');
    headers.delete('content-length');
    headers.set('content-type', 'application/json; charset=utf-8');
    return Response.json(output.data, { status: response.status, headers });
  }
  if (declared.kind === 'empty' && response.body !== null) throw new AppError('internal_error');
  if (declared.kind === 'redirect') {
    if (response.body !== null) throw new AppError('internal_error');
    const location = headers.get('location');
    if (!location || redactSecretText(location) !== location) throw new AppError('internal_error');
    const target = new URL(location, 'https://relative.invalid');
    if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password)
      throw new AppError('internal_error');
  }
  if (declared.kind === 'csv') {
    headers.set('content-type', 'text/csv; charset=utf-8');
    headers.set('content-disposition', 'attachment; filename="export.csv"');
  }
  return new Response(response.body, { status: response.status, headers });
}

/** Captures each input schema in a closure before erasing heterogeneous registered routes. */
export function routeRegistrar<Runtime>(
  context: (execution: ModuleExecution) => Runtime,
  kind: 'management' | 'public',
) {
  const routes: RegisteredRoute[] = [];
  function register<I extends ModuleInputSchema>(
    spec: ModuleRouteSpec<I, RoutePolicy> & { access?: PublicAccessInput },
    handler: (runtime: Runtime, input: z.output<I>) => Promise<Response>,
  ) {
    const policy = freezeDeclaration(routePolicySchema.parse(spec.policy));
    if (
      policy.kind !== kind ||
      (spec.path !== '/' &&
        !/^\/(?:[a-z0-9-]+|\{[A-Za-z][A-Za-z0-9]*\})(?:\/(?:[a-z0-9-]+|\{[A-Za-z][A-Za-z0-9]*\}))*\/?$/.test(
          spec.path,
        ))
    )
      throw new AppError('invalid_request', { detail: 'Invalid module route declaration.' });
    schemaDocument(spec.input, 'input');
    activityNameSchema.parse(spec.operationId);
    if (Object.keys(spec.responses).length === 0) throw new AppError('invalid_request');
    for (const [status, response] of Object.entries(spec.responses)) {
      const code = z.number().int().min(200).max(599).parse(Number(status));
      if (
        (response.kind === 'redirect') !== [301, 302, 303, 307, 308].includes(code) ||
        ((code === 204 || code === 205 || code === 304) && response.kind !== 'empty')
      )
        throw new AppError('invalid_request');
      z.string().min(1).parse(response.description);
      if (kind === 'public' && response.kind === 'csv') throw new AppError('invalid_request');
      if (response.kind === 'json') schemaDocument(response.schema);
    }
    const inputSchema = spec.input;
    const responses = Object.freeze(
      Object.fromEntries(
        Object.entries(spec.responses).map(([status, response]) => [
          status,
          Object.freeze({ ...response }),
        ]),
      ),
    );
    const access = spec.access
      ? freezeDeclaration(publicAccessSchema.parse(spec.access))
      : undefined;
    if (kind === 'public' && Object.hasOwn(spec.input.shape.query.shape, 'key'))
      throw new AppError('invalid_request', {
        detail: 'The public credential query parameter is reserved.',
      });
    if (
      access?.kind === 'write' &&
      access.idempotency &&
      responses[access.idempotency.status]?.kind !== 'json'
    )
      throw new AppError('invalid_request', {
        detail: 'Idempotency must select a declared JSON success response.',
      });
    if (kind === 'public' && !access) throw new AppError('invalid_request');
    if (kind === 'public' && !['GET', 'POST'].includes(spec.method))
      throw new AppError('invalid_request');
    if (kind === 'public' && (spec.method === 'GET') !== (access?.kind === 'read'))
      throw new AppError('invalid_request');
    routes.push(
      Object.freeze({
        ...spec,
        responses,
        access,
        policy,
        run: async (execution: ModuleExecution, input: unknown) =>
          validateResponse(await handler(context(execution), inputSchema.parse(input)), responses),
      }),
    );
  }
  return { register, routes };
}
export function jobRegistrar<Runtime>(context: (execution: ModuleExecution) => Runtime) {
  const jobs: RegisteredJob[] = [];
  const registrar: ModuleJobRegistrar<Runtime> = {
    register(spec, payload, handler) {
      const metadata = z
        .object({
          name: activityNameSchema,
          retentionSeconds: z.number().int().positive().max(MAX_JOB_RETENTION_SECONDS),
          retries: z.number().int().min(0).max(10),
          cron: z.string().min(1).max(128).optional(),
          consumes: z.array(activityNameSchema).max(100).readonly().optional(),
        })
        .strict()
        .parse(spec);
      schemaDocument(payload, 'input');
      if (metadata.cron && !payload.safeParse({}).success)
        throw new AppError('invalid_request', {
          detail: 'Scheduled jobs must accept an empty wire payload.',
        });
      jobs.push(
        Object.freeze({
          ...metadata,
          payload,
          run: async (execution: ModuleExecution, input: unknown) =>
            handler(context(execution), payload.parse(input)),
        }),
      );
    },
  };
  return { ...registrar, jobs };
}
