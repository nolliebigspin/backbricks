import { defineModuleDescriptor } from '@backbricks/core';
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

export { uploadsInfrastructure } from './infrastructure.ts';
import { uploadsInfrastructure } from './infrastructure.ts';
export { uploadsModule } from './module.ts';
export {
  uploadIntentSchema,
  uploadIntentResponseSchema,
  uploadCompleteResponseSchema,
} from './public.ts';
export { UPLOAD_LIFETIMES, UPLOAD_JOBS, UPLOAD_METRICS } from './constants.ts';

/** M1 descriptor only; the domain milestone supplies the operational definition. */
export const uploadsDescriptor = defineModuleDescriptor({
  type: 'uploads',
  displayName: { en: 'Uploads', de: 'Dateien' },
  resourceName: { singular: 'upload-zone', plural: 'upload-zones' },
  infrastructure: uploadsInfrastructure,
});

export {
  filesQuerySchema,
  fileItemSchema,
  fileDetailSchema,
  filesPageSchema,
  storageUsageSchema,
} from './admin-schemas.ts';
