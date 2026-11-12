import type { z } from 'zod';

import type { PublicAccessInput } from '../abuse/policy.ts';
import type { ManagementRoutePolicy, RoutePolicy } from '../http/route-policy.ts';

export type ModuleInputSchema = z.ZodObject<{
  params: z.ZodObject;
  query: z.ZodObject;
  body: z.ZodType;
}>;
export type ModuleResponseDefinition =
  | { kind: 'json'; description: string; schema: z.ZodType }
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
      /** `form: true` on writes opts into flat urlencoded fields and HTML/303 results. */
      access: PublicAccessInput;
    },
    handler: (runtime: Runtime, input: z.output<I>) => Promise<Response>,
  ): void;
}
