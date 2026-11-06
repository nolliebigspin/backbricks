import type { InfraRequirement } from '@backbricks/core';

/** Forms needs nothing besides Postgres (ARCHITECTURE §C.7). Moves into the ModuleDefinition in P1.6. */
export const formsInfrastructure = [] as const satisfies readonly InfraRequirement[];
