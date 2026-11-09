/**
 * Config format version. Version 1 needs no `migrateConfig`: the core parses configs stored at the
 * current version directly; a later format change adds the hook (ADR-0041).
 */
export const FORMS_MODULE_VERSION = 1;

export const FORMS_EVENTS = {
  submissionCreated: 'forms.submission.created',
} as const;
export const FORMS_AUDIT_ACTIONS = {
  submissionUpdated: 'forms.submission.updated',
  submissionDeleted: 'forms.submission.deleted',
  bulkUpdated: 'forms.submissions.bulk_updated',
  bulkDeleted: 'forms.submissions.bulk_deleted',
  deleteAllRequested: 'forms.submissions.delete_all_requested',
  deletedAll: 'forms.submissions.deleted_all',
} as const;
export const FORMS_METRICS = { submissions: 'forms.submissions' } as const;
export const FORMS_JOBS = { deleteAll: 'forms.submissions.delete-all' } as const;

/** Hard upper bounds for one form's configuration (docs/modules/forms.md §2). */
export const FORMS_LIMITS = {
  fields: 50,
  listFields: 5,
  options: 100,
  fieldKeyLength: 64,
  optionValueLength: 64,
  labelLength: 200,
  helpLength: 500,
  textMaxLength: 1000,
  textareaMaxLength: 10_000,
  urlMaxLength: 2048,
  hiddenMaxLength: 500,
  consentTextLength: 2000,
  consentVersionLength: 64,
  maxFilesPerField: 10,
  redirectUrlLength: MAX_PUBLIC_REDIRECT_URL_LENGTH,
  perMinute: 1000,
  perHour: 10_000,
  /** Serialized configuration size; matches the public submission body limit. */
  configBytes: 64 * 1024,
} as const;

export const FORMS_DEFAULTS = {
  textMaxLength: 500,
  textareaMaxLength: 5000,
  hiddenMaxLength: 500,
  retentionDays: 180,
  /** Forms that switch proof-of-work off get a lower per-IP default (Q13). */
  perMinuteWithoutProofOfWork: 5,
} as const;

export const FORMS_RETENTION_DAYS = { min: 7, max: 3650 } as const;

/** Public submission body limit (ARCHITECTURE §D.5). */
export const FORMS_BODY_LIMIT_BYTES = 64 * 1024;

export const FORM_FIELD_TYPES = [
  'text',
  'textarea',
  'email',
  'phone',
  'number',
  'url',
  'select',
  'multiselect',
  'checkbox',
  'date',
  'hidden',
  'consent',
  'file',
] as const;
import { MAX_PUBLIC_REDIRECT_URL_LENGTH } from '@backbricks/core';
