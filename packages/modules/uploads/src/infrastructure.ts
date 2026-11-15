import type { InfraRequirement } from '@backbricks/core';

/** Files always need private storage; an installation may explicitly permit unscanned zones. */
export const uploadsInfrastructure = [
  { service: 'storage' },
  { service: 'scanner', optional: true },
] as const satisfies readonly InfraRequirement[];
