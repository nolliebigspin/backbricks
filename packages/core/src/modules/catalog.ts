import { z } from 'zod';

import { AppError } from '../errors/app-error.ts';
import { infraRequirementSchema, type AvailableModules } from './infrastructure.ts';
import type { RegisteredModule } from './registered.ts';
import { defineRegistry } from './registry.ts';
import { freezeDeclaration, metadataSchema, uniqueModuleValues } from './validation.ts';

const descriptorSchema = metadataSchema
  .pick({ type: true, displayName: true, resourceName: true })
  .extend({ infrastructure: z.array(infraRequirementSchema).readonly() })
  .strict();
export type ModuleDescriptor = z.infer<typeof descriptorSchema>;
export type ModuleCatalogEntry = ModuleDescriptor | RegisteredModule;
export const moduleAvailabilitySchema = descriptorSchema
  .omit({ infrastructure: true })
  .extend({
    enabled: z.boolean(),
    operational: z.boolean(),
  })
  .strict();
export const platformMetaSchema = z.object({ modules: z.array(moduleAvailabilitySchema) }).strict();

/** Describes shipped code before its domain API exists; it grants no routes, jobs or capabilities. */
export function defineModuleDescriptor(input: ModuleDescriptor): Readonly<ModuleDescriptor> {
  return freezeDeclaration(descriptorSchema.parse(input));
}
function implemented(entry: ModuleCatalogEntry): entry is RegisteredModule {
  return 'moduleVersion' in entry;
}

/** One catalog feeds environment validation, runtime selection and safe public availability. */
export function defineModuleCatalog(input: readonly ModuleCatalogEntry[]) {
  const entries = input.map((entry) =>
    implemented(entry) ? entry : defineModuleDescriptor(entry),
  );
  entries.forEach((entry) =>
    descriptorSchema.parse({
      type: entry.type,
      displayName: entry.displayName,
      resourceName: entry.resourceName,
      infrastructure: entry.infrastructure,
    }),
  );
  uniqueModuleValues(
    entries.map((entry) => entry.type),
    'type',
  );
  uniqueModuleValues(
    entries.flatMap((entry) => [entry.resourceName.singular, entry.resourceName.plural]),
    'resource name',
  );
  const available: AvailableModules = freezeDeclaration(
    Object.fromEntries(entries.map((entry) => [entry.type, entry.infrastructure])),
  );
  return Object.freeze({
    available,
    select(enabledModules: readonly string[]) {
      const enabled = new Set(enabledModules);
      if (enabledModules.some((type) => !Object.hasOwn(available, type)))
        throw new AppError('invalid_request', { detail: 'Unknown module selection.' });
      const selected = entries.filter((entry) => enabled.has(entry.type));
      const registry = defineRegistry(selected.filter(implemented));
      const metadata = freezeDeclaration(
        platformMetaSchema.parse({
          modules: entries.map((entry) => ({
            type: entry.type,
            displayName: entry.displayName,
            resourceName: entry.resourceName,
            enabled: enabled.has(entry.type),
            operational: enabled.has(entry.type) && implemented(entry),
          })),
        }),
      );
      return Object.freeze({
        registry,
        metadata,
        available,
        require(type: string): RegisteredModule {
          const module = registry.get(type);
          if (!module)
            throw new AppError('module_not_enabled', {
              hint: 'Enable an implemented module to use this API.',
            });
          return module;
        },
      });
    },
  });
}
export type SelectedModules = ReturnType<ReturnType<typeof defineModuleCatalog>['select']>;

/** Matches only declared primary module namespaces; it never inspects tenant identifiers. */
export function unavailableModuleAtPath(modules: SelectedModules, path: string): boolean {
  const resource = /^\/v1\/(?:public|projects\/[^/]+)\/([^/]+)(?:\/|$)/.exec(path)?.[1];
  return modules.metadata.modules.some(
    (module) => module.resourceName.plural === resource && !module.operational,
  );
}
