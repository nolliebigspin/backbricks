import { defineModuleDescriptor, type InfraRequirement } from '@backbricks/core';
export { uploadRecordSchema } from './repository.ts';
export type {
  UploadRecord,
  UploadInsert,
  UploadChanges,
  UploadFilters,
  UploadOwner,
  UploadReadOptions,
  UploadsRepository,
} from './repository.ts';

export {
  uploadsConfigSchema,
  uploadsModuleConfigSchema,
  uploadsPublicWritePolicy,
  uploadConfigWarnings,
  type UploadsConfig,
  type UploadsConfigInput,
} from './config.ts';
export { UPLOAD_LIMITS, UPLOADS_MODULE_VERSION } from './constants.ts';
export { uploadsTemplates, defaultUploadsConfig, type UploadTemplateName } from './templates.ts';
export { classifyUploadsChange } from './changes.ts';
export { uploadsCodegen } from './codegen.ts';
export { uploadDeclarationSchema, type UploadDeclaration } from './declaration.ts';
export { validateUploadDeclaration } from './validation.ts';
export {
  UPLOAD_FORMATS,
  UPLOAD_PRESETS,
  uploadMimeSchema,
  uploadPresetSchema,
  type UploadPreset,
} from './formats.ts';
export { uploadFilenameSchema, uploadStatusSchema, type UploadStatus } from './values.ts';

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
