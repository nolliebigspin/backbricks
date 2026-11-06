import { AppError } from '../errors/app-error.ts';
import { KEY_SCOPES } from '../keys/scopes.ts';
import type { ServiceContainer } from '../services/container.ts';
import { CORE_EVENTS } from '../services/event-types.ts';
import type { TenantHandle, TenantTransaction } from '../tenancy/tenant-context.ts';
import {
  bindCapability,
  type Capability,
  type CapabilityMap,
  type CapabilityName,
} from './capabilities.ts';
import type { ModuleExecution } from './contract.ts';
import type { RegisteredModule } from './registered.ts';
import { uniqueModuleValues as unique } from './validation.ts';

function fail(detail: string): never {
  throw new AppError('invalid_request', { detail });
}
function checkDefinitions(modules: readonly RegisteredModule[]) {
  unique(
    modules.map((module) => module.type),
    'type',
  );
  unique(
    modules.flatMap((module) => [module.resourceName.singular, module.resourceName.plural]),
    'resource name',
  );
  unique(
    modules.flatMap((module) => module.scopes.map((entry) => entry.name)),
    'scope',
  );
  unique(
    modules.flatMap((module) => module.events.map((entry) => entry.name)),
    'event',
  );
  unique(
    modules.flatMap((module) => module.usageMetrics.map((entry) => entry.name)),
    'metric',
  );
  unique(
    modules.flatMap((module) => module.provides),
    'capability provider',
  );
  unique(
    modules.flatMap((module) =>
      [...module.adminRoutes, ...module.publicRoutes].map((route) => route.operationId),
    ),
    'operation ID',
  );
  unique(
    modules.flatMap((module) => module.jobs.map((job) => job.name)),
    'job',
  );
  const coreEvents = new Set<string>(Object.values(CORE_EVENTS));
  for (const module of modules) {
    unique([...module.requires, ...module.optional], 'capability requirement');
    for (const scope of module.scopes) {
      const builtIn = KEY_SCOPES.find((entry) => entry.name === scope.name);
      if (!scope.name.startsWith(`${module.type}:`) || (builtIn && builtIn.module !== module.type))
        fail('A scope must belong to its declaring module.');
    }
    if (module.events.some((event) => coreEvents.has(event.name)))
      fail('Module events collide with platform events.');
    for (const entry of [...module.events, ...module.usageMetrics, ...module.jobs])
      if (!entry.name.startsWith(`${module.type}.`))
        fail('Module names must use their own namespace.');
    for (const routes of [module.adminRoutes, module.publicRoutes]) {
      unique(
        routes.map(
          (route) => `${route.method} ${route.path.replace(/\{[^}]+\}/g, '{}').replace(/\/$/, '')}`,
        ),
        'route',
      );
      for (const route of routes) {
        const quota = route.access?.kind === 'write' ? route.access.quota : undefined;
        if (quota && !module.usageMetrics.some((metric) => metric.name === quota.metric))
          fail('A public quota uses an undeclared metric.');
        const scope =
          route.policy.kind === 'management'
            ? route.policy.secretKey?.scope
            : route.access?.kind === 'write'
              ? route.access.secretScope
              : undefined;
        if (
          scope &&
          !module.scopes.some((entry) => entry.name === scope) &&
          !KEY_SCOPES.some((entry) => entry.name === scope && entry.module === null)
        )
          fail('A route uses an undeclared scope.');
      }
    }
  }
}

/** Validate a static selection and order providers before consumers; absent optional providers are null. */
export function defineRegistry(input: readonly RegisteredModule[]) {
  const modules = [...input];
  checkDefinitions(modules);
  const byType = new Map(modules.map((module) => [module.type, module]));
  const owners = new Map(
    modules.flatMap((module) => module.provides.map((name) => [name, module] as const)),
  );
  const ordered: RegisteredModule[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function visit(module: RegisteredModule) {
    if (visiting.has(module.type)) fail('Module capability dependencies contain a cycle.');
    if (visited.has(module.type)) return;
    visiting.add(module.type);
    for (const name of module.requires)
      if (!owners.has(name)) fail(`Required capability is unavailable: ${name}.`);
    for (const name of [...module.requires, ...module.optional]) {
      const owner = owners.get(name);
      if (owner) visit(owner);
    }
    visiting.delete(module.type);
    visited.add(module.type);
    ordered.push(module);
  }
  modules.forEach(visit);
  const definitions = Object.freeze(ordered);
  return Object.freeze({
    modules: definitions,
    get: (type: string) => byType.get(type) ?? null,
    scopes: Object.freeze(
      modules.flatMap((module) =>
        module.scopes.map((entry) => ({ ...entry, module: module.type })),
      ),
    ),
    bind(services: ServiceContainer) {
      // Required providers fail startup, before the first request/job touches a module.
      for (const module of definitions)
        services.forModule({
          required: module.requiredServices,
          optional: module.optionalServices,
        });
      return Object.freeze({
        forTenant(tx: TenantTransaction) {
          tx.assertActive();
          const handle: TenantHandle = Object.freeze({
            context: tx.context,
            identity: tx.identity,
            assertActive: tx.assertActive,
          });
          const cache: { -readonly [K in keyof CapabilityMap]?: CapabilityMap[K] } = {};
          const constructing = new Set<CapabilityName>();
          function execution(type: string): ModuleExecution {
            if (!byType.has(type)) throw new AppError('not_found');
            return { moduleType: type, tx, handle, services, capability };
          }
          function capability<K extends CapabilityName>(name: K): Capability<K> | null {
            tx.assertActive();
            const existing = cache[name];
            if (Object.hasOwn(cache, name) && existing) return existing;
            const owner = owners.get(name);
            if (!owner) return null;
            if (constructing.has(name)) throw new AppError('internal_error');
            constructing.add(name);
            try {
              const provided = owner.provide(name, execution(owner.type));
              if (!provided)
                throw new AppError('internal_error', {
                  detail: 'Declared capability has no implementation.',
                });
              const bound = bindCapability(handle, provided);
              Object.defineProperty(cache, name, { value: bound, enumerable: true });
              return bound;
            } finally {
              constructing.delete(name);
            }
          }
          return Object.freeze({ execution, capability });
        },
      });
    },
  });
}
export type ModuleRegistry = ReturnType<typeof defineRegistry>;
