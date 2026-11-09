import { defineModuleDescriptor, type InfraRequirement } from '@backbricks/core';

export {
  assertFieldCapabilities,
  fieldKeySchema,
  formFieldSchema,
  formsConfigSchema,
  formsPublicWritePolicy,
  redirectUrlSchema,
  type FormField,
  type FormsConfig,
  type FormsConfigInput,
} from './config.ts';
export {
  FORM_FIELD_TYPES,
  FORMS_BODY_LIMIT_BYTES,
  FORMS_DEFAULTS,
  FORMS_LIMITS,
  FORMS_MODULE_VERSION,
  FORMS_RETENTION_DAYS,
} from './constants.ts';
export { classifyFormsChange } from './changes.ts';
export type {
  FormsRepository,
  SpamStatus,
  SubmissionChanges,
  SubmissionCounts,
  SubmissionFilters,
  SubmissionInsert,
  SubmissionRecord,
  SubmissionSource,
  SubmissionStatus,
} from './repository.ts';
export { formsCodegen } from './codegen.ts';
export {
  validateSubmission,
  type NormalizedSubmission,
  type SubmissionTransport,
} from './validator.ts';
export { defaultFormsConfig, formsTemplates, type FormTemplateName } from './templates.ts';

/** Forms needs nothing besides Postgres (ARCHITECTURE §C.7). The full definition arrives in its domain milestone. */
export const formsInfrastructure = [] as const satisfies readonly InfraRequirement[];

/** M1 descriptor only; the domain milestone supplies the operational definition. */
export const formsDescriptor = defineModuleDescriptor({
  type: 'forms',
  displayName: { en: 'Forms', de: 'Formulare' },
  resourceName: { singular: 'form', plural: 'forms' },
  infrastructure: formsInfrastructure,
});
