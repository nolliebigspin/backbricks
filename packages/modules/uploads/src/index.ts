import type { InfraRequirement } from '@backbricks/core';

/**
 * Uploads stores files in S3-compatible storage and scans them when a scanner is configured
 * (`SCANNER=none` is allowed). Moves into the ModuleDefinition in P1.6.
 */
export const uploadsInfrastructure = [
  { service: 'storage' },
  { service: 'scanner', optional: true },
] as const satisfies readonly InfraRequirement[];
