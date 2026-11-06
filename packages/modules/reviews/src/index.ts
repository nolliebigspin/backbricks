import type { InfraRequirement } from '@backbricks/core';

/** Reviews needs nothing besides Postgres (ARCHITECTURE §C.7). Moves into the ModuleDefinition in P1.6. */
export const reviewsInfrastructure = [] as const satisfies readonly InfraRequirement[];
