import type { z } from 'zod';

import type { RoutePolicy } from '../http/route-policy.ts';
import type { OptionalServiceName } from '../services/container.ts';
import type { Capability, CapabilityName } from './capabilities.ts';
import type { ModuleExecution } from './contract.ts';
import type { InfraRequirement } from './infrastructure.ts';
import type { ModuleJobSpec } from './jobs.ts';
import type { ModuleInputSchema, ModuleResponseDefinition } from './routes.ts';
import type {
  ConfigChangeReport,
  EventDefinition,
  JsonValue,
  MetricDefinition,
  ScopeDefinition,
} from './values.ts';

export type RegisteredRoute = {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  operationId: string;
  input: ModuleInputSchema;
  responses: Readonly<Record<number, ModuleResponseDefinition>>;
  policy: RoutePolicy;
  access?: { kind: 'read' } | { kind: 'write'; secretScope: string };
  run(execution: ModuleExecution, input: unknown): Promise<Response>;
};
export type RegisteredJob = ModuleJobSpec & {
  payload: z.ZodType;
  run(execution: ModuleExecution, payload: unknown): Promise<void>;
};
export type RegisteredModule = Readonly<{
  type: string;
  moduleVersion: number;
  displayName: { en: string; de: string };
  resourceName: { singular: string; plural: string };
  infrastructure: readonly InfraRequirement[];
  scopes: readonly ScopeDefinition[];
  events: readonly EventDefinition[];
  usageMetrics: readonly MetricDefinition[];
  requires: readonly CapabilityName[];
  optional: readonly CapabilityName[];
  provides: readonly CapabilityName[];
  requiredServices: readonly OptionalServiceName[];
  optionalServices: readonly OptionalServiceName[];
  configSchema: z.ZodType;
  configJsonSchema: Readonly<Record<string, JsonValue>>;
  templates: Readonly<Record<string, { name: string; config: JsonValue }>>;
  parseConfig(input: unknown): JsonValue;
  defaultConfig(): JsonValue;
  migrateConfig(fromVersion: number, config: unknown): JsonValue;
  validateConfigChange(previous: unknown, next: unknown): ConfigChangeReport;
  codegen(instance: unknown): string | null;
  provide<K extends CapabilityName>(name: K, execution: ModuleExecution): Capability<K> | undefined;
  adminRoutes: readonly RegisteredRoute[];
  publicRoutes: readonly RegisteredRoute[];
  jobs: readonly RegisteredJob[];
  retention: {
    purgeExpired(execution: ModuleExecution, input: { now: Date; limit: number }): Promise<number>;
    recomputeExpiry(execution: ModuleExecution, instance: unknown, now: Date): Promise<number>;
  };
  privacy: {
    exportSubject(execution: ModuleExecution, email: string): Promise<JsonValue>;
    deleteSubject(execution: ModuleExecution, email: string): Promise<number>;
  };
}>;
