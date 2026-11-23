import {
  AppError,
  earliestExpiry,
  expiresAfterDays,
  principalActor,
  type ModuleAdminRouter,
} from '@backbricks/core';
import { z } from 'zod';

import { FORMS_BODY_LIMIT_BYTES } from './constants.ts';
import { entryExpiry, searchText } from './entries.ts';
import { formKeyParams, submissionAcceptedSchema, submissionBodySchema } from './public.ts';
import { formsRepository, type FormsRuntime } from './runtime.ts';
import { validateSubmission } from './validator.ts';

const TEST_RETENTION_DAYS = 7;

export function formsTestRoutes(router: ModuleAdminRouter<FormsRuntime>) {
  for (const channel of ['cli', 'mcp'] as const) {
    const operation = `forms.test.submit.${channel}`;
    router.register(
      {
        method: 'POST',
        path: channel === 'mcp' ? '/{key}/mcp-test-submissions' : '/{key}/test-submissions',
        operationId: operation,
        input: z.object({
          params: formKeyParams,
          query: z.object({}).strict(),
          body: submissionBodySchema,
        }),
        responses: {
          201: {
            kind: 'json',
            description: 'Test entry acknowledgement and skipped file validation.',
            schema: submissionAcceptedSchema.extend({ skippedFileFields: z.array(z.string()) }),
          },
        },
        policy: {
          kind: 'management',
          bodyLimitBytes: FORMS_BODY_LIMIT_BYTES,
          secretKey: { scope: 'test:write', ...(channel === 'mcp' ? { channel } : {}) },
          isolationCase: operation,
        },
      },
      async (runtime, input) => {
        const instance = await runtime.instances.get(input.params.key);
        const principal = runtime.tx.context.principal;
        if (principal?.kind !== 'secret_key' || !principal.scopes.includes('test:write'))
          throw new AppError('forbidden');
        const now = runtime.services.clock.now();
        const fileFields = instance.config.fields.filter((field) => field.type === 'file');
        const { data, subjectEmail } = validateSubmission(
          {
            ...instance.config,
            fields: instance.config.fields.filter((field) => field.type !== 'file'),
          },
          input.body,
          { transport: 'json', now, formKey: input.params.key },
        );
        const id = runtime.services.ids.generate('sub');
        await formsRepository(runtime).insert({
          id,
          instanceId: instance.id,
          configVersion: instance.configVersion,
          data,
          status: 'open',
          readAt: null,
          spamVerdict: 'clean',
          spamReasons: [],
          isTest: true,
          subjectEmail,
          source: { uaFamily: 'unknown' },
          createdAt: now,
          updatedAt: now,
          expiresAt: earliestExpiry(
            entryExpiry(instance.config, now, 'clean'),
            expiresAfterDays(now, TEST_RETENTION_DAYS),
          ),
          searchText: searchText(instance.config, data),
        });
        await runtime.services.audit.record(runtime.tx, {
          ...principalActor(principal),
          action: 'forms.test_submitted',
          targetType: 'form_submission',
          targetId: id,
        });
        return Response.json(
          { id, skippedFileFields: fileFields.map((field) => field.key) },
          { status: 201 },
        );
      },
    );
  }
}
