import type { z } from 'zod';

import type { ManagementRoutePolicy, RoutePolicy } from '../http/route-policy.ts';
import type { JsonValue } from './values.ts';

export type ModuleInputSchema = z.ZodObject<{
  params: z.ZodObject;
  query: z.ZodObject;
  body: z.ZodType;
}>;
export type ModuleResponseDefinition =
  | { kind: 'json'; description: string; schema: z.ZodType<JsonValue> }
  | { kind: 'empty' | 'redirect'; description: string }
  | { kind: 'csv'; description: string };
export type ModuleRouteSpec<I extends ModuleInputSchema, P extends RoutePolicy> = {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** Relative to the project/resource namespace; the host owns tenant/auth binding. */
  path: string;
  operationId: string;
  input: I;
  responses: Readonly<Record<number, ModuleResponseDefinition>>;
  policy: P;
};
export interface ModuleAdminRouter<Runtime> {
  register<I extends ModuleInputSchema>(
    spec: ModuleRouteSpec<I, ManagementRoutePolicy>,
    handler: (runtime: Runtime, input: z.output<I>) => Promise<Response>,
  ): void;
}
export interface ModulePublicRouter<Runtime> {
  register<I extends ModuleInputSchema>(
    spec: ModuleRouteSpec<I, Extract<RoutePolicy, { kind: 'public' }>> & {
      access: { kind: 'read' } | { kind: 'write'; secretScope: string };
    },
    handler: (runtime: Runtime, input: z.output<I>) => Promise<Response>,
  ): void;
}
