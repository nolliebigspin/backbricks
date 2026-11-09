import { AppError, defineModule, type InfraRequirement, type JsonValue } from '@backbricks/core';

import { classifyFormsChange } from './changes.ts';
import { formsCodegen } from './codegen.ts';
import { formsModuleConfigSchema, formsPublicWritePolicy } from './config.ts';
import { FORMS_MODULE_VERSION } from './constants.ts';
import type { FormsRepository } from './repository.ts';
import { defaultFormsConfig, formsTemplates } from './templates.ts';

/** Forms needs nothing besides Postgres (ARCHITECTURE §C.7). */
export const formsInfrastructure = [] as const satisfies readonly InfraRequirement[];
export const FORMS_EVENTS = { submissionCreated: 'forms.submission.created' } as const;
export const FORMS_METRICS = { submissions: 'forms.submissions' } as const;
/** Subject erasure deletes in bounded batches inside the one erasure transaction. */
const SUBJECT_BATCH = 1000;
const SUBJECT_EXPORT_PAGE = 100;
const SUBJECT_EXPORT_MAX = 10_000;

function repositoryOf(runtime: { repository: FormsRepository | undefined }): FormsRepository {
  if (!runtime.repository)
    throw new AppError('internal_error', { detail: 'The forms repository is not bound.' });
  return runtime.repository;
}

/**
 * The operational forms module (docs/modules/forms.md). `files` tells whether the optional
 * `files` capability (uploads) exists; M2 ships without it, so `file` fields are rejected.
 */
export function createFormsModule(options: { files: boolean } = { files: false }) {
  return defineModule({
    type: 'forms',
    moduleVersion: FORMS_MODULE_VERSION,
    displayName: { en: 'Forms', de: 'Formulare' },
    resourceName: { singular: 'form', plural: 'forms' },
    infrastructure: formsInfrastructure,
    configSchema: formsModuleConfigSchema(options),
    defaultConfig: defaultFormsConfig,
    templates: formsTemplates(options),
    validateConfigChange: classifyFormsChange,
    codegen: formsCodegen,
    publicWritePolicy: formsPublicWritePolicy,
    scopes: [
      {
        name: 'forms:submit',
        description: {
          en: 'Submit form entries from a server, without proof-of-work',
          de: 'Formulareinträge vom Server senden, ohne Proof-of-Work',
        },
      },
    ],
    events: [
      {
        name: FORMS_EVENTS.submissionCreated,
        description: { en: 'A form entry was received', de: 'Ein Formulareintrag ist eingegangen' },
      },
    ],
    usageMetrics: [
      {
        name: FORMS_METRICS.submissions,
        kind: 'counter',
        unit: 'count',
        label: { en: 'Form entries', de: 'Formulareinträge' },
      },
    ],
    optional: ['files'],
    retention: {
      purgeExpired: (runtime, { now, limit }) => repositoryOf(runtime).purgeExpired(now, limit),
      recomputeExpiry: (runtime, instance) =>
        repositoryOf(runtime).recomputeExpiry(instance.id, instance.config.retentionDays),
    },
    privacy: {
      async exportSubject(runtime, email) {
        const repository = repositoryOf(runtime);
        const entries: JsonValue[] = [];
        let before: { createdAt: Date; id: string } | undefined;
        while (entries.length < SUBJECT_EXPORT_MAX) {
          // oxlint-disable-next-line no-await-in-loop -- Keyset pages follow the previous page.
          const page = await repository.findBySubject(email, {
            limit: SUBJECT_EXPORT_PAGE,
            before,
          });
          for (const entry of page)
            entries.push({
              id: entry.id,
              formId: entry.instanceId,
              receivedAt: entry.createdAt.toISOString(),
              status: entry.status,
              data: entry.data,
            });
          const last = page.at(-1);
          if (page.length < SUBJECT_EXPORT_PAGE || !last) break;
          before = last;
        }
        return { entries };
      },
      async deleteSubject(runtime, email) {
        const repository = repositoryOf(runtime);
        let total = 0;
        for (;;) {
          // oxlint-disable-next-line no-await-in-loop -- Bounded batches in one erasure transaction.
          const deleted = await repository.deleteBySubject(email, SUBJECT_BATCH);
          total += deleted.length;
          if (deleted.length < SUBJECT_BATCH) return total;
        }
      },
    },
  });
}

export const formsModule = createFormsModule();
