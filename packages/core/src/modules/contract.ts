import type { z } from 'zod';

import type {
  PublicReadContext,
  PublicWriteContext,
  PublicWritePolicyInput,
} from '../abuse/policy.ts';
import type { ModuleInstance } from '../platform/models.ts';
import type { InstanceRevision } from '../platform/models.ts';
import type { OptionalServiceName } from '../services/container.ts';
import type { ModuleRepositories, RepositoryPage } from '../tenancy/repositories.ts';
import type { TenantHandle } from '../tenancy/tenant-context.ts';
import type { CapabilityFactories, CapabilityName, capabilityView } from './capabilities.ts';
import type { InfraRequirement } from './infrastructure.ts';
import type { ModuleJobRegistrar } from './jobs.ts';
import type { ModuleAdminRouter, ModulePublicRouter } from './routes.ts';
import type { BoundCoreServices, ModuleOptionalServices } from './services.ts';
import type { ModuleStreamPage } from './streams.ts';
import type {
  ConfigChangeReport,
  EventDefinition,
  JsonValue,
  MetricDefinition,
  ScopeDefinition,
} from './values.ts';

export type ConfiguredInstance<T> = Omit<ModuleInstance, 'config'> & { config: T };
/** Read-only configuration access fixed to the module and caller transaction. */
export type ModuleInstanceReads<T> = Readonly<{
  get(key: string): Promise<ConfiguredInstance<T>>;
  revision(key: string, version: number): Promise<ConfiguredInstance<T>>;
  revisions(
    key: string,
    page: RepositoryPage,
  ): Promise<(Omit<InstanceRevision, 'config'> & { config: T })[]>;
}>;
export type RequiredInfrastructure<I extends readonly InfraRequirement[]> =
  I[number] extends infer D
    ? D extends { optional: true }
      ? never
      : D extends { service: infer S extends OptionalServiceName }
        ? S
        : never
    : never;
export type OptionalInfrastructure<I extends readonly InfraRequirement[]> =
  I[number] extends infer D
    ? D extends { service: infer S extends OptionalServiceName; optional: true }
      ? S
      : never
    : never;
export type ModuleServices<
  R extends OptionalServiceName,
  O extends OptionalServiceName,
> = BoundCoreServices & {
  require<K extends R>(name: K): NonNullable<ModuleOptionalServices[K]>;
  optional<K extends O>(name: K): ModuleOptionalServices[K];
};
export type ModuleDataRuntime<
  T,
  R extends CapabilityName,
  O extends CapabilityName,
  SR extends OptionalServiceName,
  SO extends OptionalServiceName,
  MT extends string = string,
> = Readonly<{
  tx: TenantHandle;
  repository: Partial<ModuleRepositories>[MT];
  config(input: unknown): T;
  instances: ModuleInstanceReads<T>;
  capabilities: ReturnType<typeof capabilityView<R, O>>;
  services: ModuleServices<SR, SO>;
  /** Public read routes: the active instance and its validated config. */
  publicRead?: Readonly<PublicReadContext>;
  /** Public write routes: instance, config, spam verdict and minimized request source. */
  publicWrite?: Readonly<PublicWriteContext>;
}>;
/** CSV readers receive fresh, module-owned frames after the request's audit transaction commits. */
export type ModuleRuntime<
  T,
  R extends CapabilityName,
  O extends CapabilityName,
  SR extends OptionalServiceName,
  SO extends OptionalServiceName,
  MT extends string = string,
> = ModuleDataRuntime<T, R, O, SR, SO, MT> &
  Readonly<{
    streamText?: (
      prefix: string,
      read: (
        runtime: ModuleDataRuntime<T, R, O, SR, SO, MT>,
        cursor: string | undefined,
      ) => Promise<ModuleStreamPage>,
    ) => ReadableStream<Uint8Array>;
  }>;
export type { ModuleExecution } from './execution.ts';

export type ModuleDefinition<
  T,
  R extends CapabilityName,
  O extends CapabilityName,
  SR extends OptionalServiceName,
  SO extends OptionalServiceName,
  I extends readonly InfraRequirement[],
  MT extends string,
> = {
  type: MT;
  moduleVersion: number;
  displayName: { en: string; de: string };
  resourceName: { singular: string; plural: string };
  infrastructure: I;
  configSchema: z.ZodType<T>;
  defaultConfig(): T;
  templates?: Readonly<Record<string, { name: string; config: T }>>;
  migrateConfig?(fromVersion: number, config: unknown): T;
  validateConfigChange?(previous: T, next: T): ConfigChangeReport;
  codegen?(instance: ConfiguredInstance<T>): string;
  publicWritePolicy?(config: T): PublicWritePolicyInput;
  scopes: readonly ScopeDefinition[];
  events: readonly EventDefinition[];
  usageMetrics: readonly MetricDefinition[];
  requires?: readonly R[];
  optional?: readonly O[];
  services?: { required?: readonly SR[]; optional?: readonly SO[] };
  provides?: CapabilityFactories<
    ModuleRuntime<
      T,
      NoInfer<R>,
      NoInfer<O>,
      NoInfer<SR> | RequiredInfrastructure<I>,
      NoInfer<SO> | OptionalInfrastructure<I>,
      MT
    >
  >;
  adminRoutes?(
    router: ModuleAdminRouter<
      ModuleRuntime<
        T,
        NoInfer<R>,
        NoInfer<O>,
        NoInfer<SR> | RequiredInfrastructure<I>,
        NoInfer<SO> | OptionalInfrastructure<I>,
        MT
      >
    >,
  ): void;
  publicRoutes?(
    router: ModulePublicRouter<
      ModuleRuntime<
        T,
        NoInfer<R>,
        NoInfer<O>,
        NoInfer<SR> | RequiredInfrastructure<I>,
        NoInfer<SO> | OptionalInfrastructure<I>,
        MT
      >
    >,
  ): void;
  jobs?(
    registrar: ModuleJobRegistrar<
      ModuleRuntime<
        T,
        NoInfer<R>,
        NoInfer<O>,
        NoInfer<SR> | RequiredInfrastructure<I>,
        NoInfer<SO> | OptionalInfrastructure<I>,
        MT
      >
    >,
  ): void;
  retention: {
    purgeExpired(
      runtime: ModuleRuntime<
        T,
        R,
        O,
        SR | RequiredInfrastructure<I>,
        SO | OptionalInfrastructure<I>,
        MT
      >,
      input: { now: Date; limit: number },
    ): Promise<number>;
    recomputeExpiry(
      runtime: ModuleRuntime<
        T,
        R,
        O,
        SR | RequiredInfrastructure<I>,
        SO | OptionalInfrastructure<I>,
        MT
      >,
      instance: ConfiguredInstance<T>,
      now: Date,
    ): Promise<number>;
  };
  privacy: {
    exportSubject(
      runtime: ModuleRuntime<
        T,
        R,
        O,
        SR | RequiredInfrastructure<I>,
        SO | OptionalInfrastructure<I>,
        MT
      >,
      email: string,
    ): Promise<JsonValue>;
    deleteSubject(
      runtime: ModuleRuntime<
        T,
        R,
        O,
        SR | RequiredInfrastructure<I>,
        SO | OptionalInfrastructure<I>,
        MT
      >,
      email: string,
    ): Promise<number>;
  };
};
