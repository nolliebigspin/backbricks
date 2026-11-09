import type { TenantContext } from '@backbricks/core';

import type { DbTransaction } from '../client.ts';
import { createRepositoryScope, type RepositoryScope } from './scope.ts';

/** A module table's repository factory: db owns the table, the module owns the interface (ADR-0055). */
export type ModuleRepositoryFactory<R> = (tx: DbTransaction, scope: RepositoryScope) => R;

/**
 * Production repository factories, keyed by module type. Every module table has one, whether or
 * not the module is enabled (one migration history, §C.7); selection happens at composition.
 */
export const moduleRepositoryFactories = Object.freeze({});
export type ModuleRepositoryFactories = typeof moduleRepositoryFactories;

/**
 * Bind the factories of the enabled modules to `withTenant`. Disabled modules get no handle, and
 * every handle shares the transaction's scope and lifetime guard (ADR-0024).
 */
export function selectModuleRepositories<
  F extends Readonly<Record<string, ModuleRepositoryFactory<unknown>>>,
>(factories: F, enabled: readonly string[]) {
  const selected = Object.entries(factories).filter(([type]) => enabled.includes(type));
  return (tx: DbTransaction, context: TenantContext, assertActive: () => void) => {
    const scope = createRepositoryScope(context, assertActive);
    // The mapped type carries each factory's own repository type to the server's composition
    // check; entries are built from exactly those factories.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- See above.
    return Object.fromEntries(
      selected.map(([type, factory]) => [type, Object.freeze(factory(tx, scope))]),
    ) as { readonly [K in keyof F]?: ReturnType<F[K]> };
  };
}
