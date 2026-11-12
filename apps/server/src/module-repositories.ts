import type { ModuleRepositories, SelectedModules } from '@backbricks/core';
import {
  moduleRepositoryFactories,
  selectModuleRepositories,
  type ModuleRepositoryFactory,
} from '@backbricks/db';

/** Repository interfaces that module packages declare by augmenting `ModuleRepositories`. */
type DeclaredRepositories = {
  [K in keyof ModuleRepositories as string extends K ? never : K]: ModuleRepositories[K];
};

/**
 * Composition check (ADR-0055): this assignment stops compiling when a module declares a
 * repository that db does not implement, or db's implementation no longer matches it.
 */
const factories: {
  readonly [K in keyof DeclaredRepositories]: ModuleRepositoryFactory<DeclaredRepositories[K]>;
} = moduleRepositoryFactories;

/** Bind repositories for the selected modules only; disabled modules get no handle. */
export function moduleRepositories(modules: SelectedModules) {
  return selectModuleRepositories(
    factories,
    modules.registry.modules.map((module) => module.type),
  );
}
