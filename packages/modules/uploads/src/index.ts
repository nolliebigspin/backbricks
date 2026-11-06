import { defineModuleDescriptor, type InfraRequirement } from '@backbricks/core';

/**
 * Uploads stores files in S3-compatible storage and scans them when a scanner is configured
 * (`SCANNER=none` is allowed). The full definition arrives in its domain milestone.
 */
export const uploadsInfrastructure = [
  { service: 'storage' },
  { service: 'scanner', optional: true },
] as const satisfies readonly InfraRequirement[];

/** M1 descriptor only; the domain milestone supplies the operational definition. */
export const uploadsDescriptor = defineModuleDescriptor({
  type: 'uploads',
  displayName: { en: 'Uploads', de: 'Dateien' },
  resourceName: { singular: 'upload-zone', plural: 'upload-zones' },
  infrastructure: uploadsInfrastructure,
});
