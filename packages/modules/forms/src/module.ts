import { AppError, defineModule, type InfraRequirement } from '@backbricks/core';
import { z } from 'zod';

import { formsAdminRoutes } from './admin.ts';
import { claimEntryFiles } from './attachments.ts';
import { classifyFormsChange } from './changes.ts';
import { formsCodegen } from './codegen.ts';
import { formsConfigSchema, formsModuleConfigSchema, formsPublicWritePolicy } from './config.ts';
import {
  FORMS_BODY_LIMIT_BYTES,
  FORMS_MODULE_VERSION,
  FORMS_EVENTS,
  FORMS_METRICS,
} from './constants.ts';
export { FORMS_EVENTS, FORMS_METRICS } from './constants.ts';
import { formsBulkRoutes, formsJobs } from './bulk.ts';
import { entryExpiry, searchText } from './entries.ts';
import { formsExportRoutes } from './export.ts';
import { purgeExpiredEntries, recomputeEntryExpiry } from './lifecycle.ts';
import { formsMutationRoutes } from './mutations.ts';
import { describeEntry } from './notifications.ts';
import { exportEntrySubject, deleteEntrySubject, eraseEntryScope } from './privacy.ts';
import {
  formKeyParams,
  publicForm,
  publicFormSchema,
  submissionAcceptedSchema,
  submissionBodySchema,
} from './public.ts';
import { formsRepository as repositoryOf } from './runtime.ts';
import { defaultFormsConfig, formsTemplates } from './templates.ts';
import { formsTestRoutes } from './test-submissions.ts';
import { validateSubmission } from './validator.ts';

/** Forms needs nothing besides Postgres (ARCHITECTURE §C.7). */
export const formsInfrastructure = [] as const satisfies readonly InfraRequirement[];
/** Browsers and CDNs may cache a form's public schema briefly (D48). */
const PUBLIC_SCHEMA_MAX_AGE_SECONDS = 60;

/**
 * The operational forms module (docs/modules/forms.md). `files` tells whether the optional
 * `files` capability exists in the selected deployment; historical configs remain readable.
 */
export function createFormsModule(options: { files: boolean } = { files: false }) {
  return defineModule({
    type: 'forms',
    moduleVersion: FORMS_MODULE_VERSION,
    displayName: { en: 'Forms', de: 'Formulare' },
    resourceName: { singular: 'form', plural: 'forms' },
    infrastructure: formsInfrastructure,
    configSchema: formsConfigSchema,
    validateConfigWrite: (config) => {
      formsModuleConfigSchema(options).parse(config);
    },
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
    services: { optional: ['queue'] },
    adminRoutes(router) {
      formsAdminRoutes(router);
      formsTestRoutes(router);
      formsMutationRoutes(router);
      formsBulkRoutes(router);
      formsExportRoutes(router);
    },
    jobs: formsJobs,
    publicRoutes(router) {
      router.register(
        {
          method: 'GET',
          path: '/{key}',
          operationId: 'forms.public.schema',
          input: z.object({
            params: formKeyParams,
            query: z.object({}).strict(),
            body: z.null(),
          }),
          responses: {
            200: { kind: 'json', description: 'The public form schema.', schema: publicFormSchema },
          },
          policy: { kind: 'public', bodyLimitBytes: 1024 },
          access: { kind: 'read' },
        },
        (runtime, input) => {
          if (!runtime.publicRead) throw new AppError('internal_error');
          return Promise.resolve(
            Response.json(publicForm(input.params.key, runtime.config(runtime.publicRead.config)), {
              headers: { 'Cache-Control': `public, max-age=${PUBLIC_SCHEMA_MAX_AGE_SECONDS}` },
            }),
          );
        },
      );
      router.register(
        {
          method: 'POST',
          path: '/{key}/submissions',
          operationId: 'forms.public.submit',
          input: z.object({
            params: formKeyParams,
            query: z.object({}).strict(),
            body: submissionBodySchema,
          }),
          responses: {
            303: {
              kind: 'redirect',
              description: 'HTML submission received, or safe error redirect.',
            },
            200: {
              kind: 'json',
              description: 'The entry was received. The body never echoes submitted data.',
              schema: submissionAcceptedSchema,
            },
          },
          policy: { kind: 'public', bodyLimitBytes: FORMS_BODY_LIMIT_BYTES },
          access: {
            kind: 'write',
            form: true,
            secretScope: 'forms:submit',
            idempotency: { status: 200 },
            quota: { metric: FORMS_METRICS.submissions },
          },
        },
        async (runtime, input) => {
          const context = runtime.publicWrite;
          if (!context) throw new AppError('internal_error');
          const config = runtime.config(context.config);
          const now = runtime.services.clock.now();
          const { data, subjectEmail } = validateSubmission(config, input.body, {
            transport: context.transport,
            now,
            formKey: input.params.key,
          });
          const id = runtime.services.ids.generate('sub');
          const expiresAt = entryExpiry(config, now, context.spam.status);
          const safeData = await claimEntryFiles(runtime, config, data, {
            id,
            subjectEmail,
            expiresAt,
          });
          await repositoryOf(runtime).insert({
            id,
            instanceId: context.instanceId,
            configVersion: context.configVersion,
            data: safeData,
            status: 'open',
            readAt: null,
            spamVerdict: context.spam.status,
            spamReasons: context.spam.reasons,
            isTest: false,
            subjectEmail,
            source: {
              uaFamily: context.source.uaFamily,
              ...(context.source.origin ? { origin: context.source.origin } : {}),
              ...(context.source.path ? { path: context.source.path } : {}),
              ...(context.source.ipHash ? { ipHash: context.source.ipHash } : {}),
            },
            createdAt: now,
            updatedAt: now,
            expiresAt,
            searchText: searchText(config, safeData),
          });
          await runtime.services.events.publish(runtime.tx, {
            type: FORMS_EVENTS.submissionCreated,
            subjectType: 'form_submission',
            subjectId: id,
            payload: {
              instanceId: context.instanceId,
              configVersion: context.configVersion,
              spam: context.spam.status,
              isTest: false,
            },
          });
          await runtime.services.usage.increment(runtime.tx, {
            metric: FORMS_METRICS.submissions,
            delta: 1n,
          });
          return Response.json(submissionAcceptedSchema.parse({ id }));
        },
      );
    },
    retention: {
      purgeExpired: purgeExpiredEntries,
      recomputeExpiry: recomputeEntryExpiry,
    },
    notifications: { describe: describeEntry },
    privacy: {
      exportSubject: exportEntrySubject,
      deleteSubject: deleteEntrySubject,
      eraseScope: eraseEntryScope,
    },
  });
}

export const formsModule = createFormsModule();
