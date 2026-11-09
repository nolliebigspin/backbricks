import {
  AppError,
  principalActor,
  spamVerdictSchema,
  type AuditMutation,
  type ModuleAdminRouter,
} from '@backbricks/core';
import { z } from 'zod';

import { FORMS_AUDIT_ACTIONS } from './constants.ts';
import { entryExpiry, markedSpamExpiry } from './entries.ts';
import { formKeyParams, submissionAcceptedSchema } from './public.ts';
import type { SubmissionChanges, SubmissionRecord } from './repository.ts';
import { formsRepository, type FormsRuntime } from './runtime.ts';

export const entryPatchSchema = z
  .object({
    status: z.enum(['open', 'done']).optional(),
    read: z.boolean().optional(),
    spamVerdict: spamVerdictSchema.shape.status.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one change is required.',
  });
const params = formKeyParams.extend({ id: z.string().min(1).max(128) });
export const mutationPolicy = (
  operation: string,
  scope: string,
  role: 'member' | 'admin' = 'member',
  bodyLimitBytes = 4096,
) => ({
  kind: 'management' as const,
  bodyLimitBytes,
  session: { role },
  secretKey: { scope },
  isolationCase: `forms.submissions.${operation}`,
});

/** All data administration records structural metadata in the same transaction. */
export async function auditEntry(
  runtime: FormsRuntime,
  action: string,
  target: { type: string; id: string },
  changes?: AuditMutation['changes'],
  system = false,
) {
  const principal = runtime.tx.context.principal;
  if (!system && !principal) throw new AppError('forbidden');
  await runtime.services.audit.record(runtime.tx, {
    ...(principal && !system
      ? principalActor(principal)
      : { actorType: 'system' as const, actorId: null }),
    action,
    targetType: target.type,
    targetId: target.id,
    changes,
  });
}

/** Preserve a record's earlier spam cap; unmarking spam restores its configured retention. */
export function entryChanges(
  runtime: FormsRuntime,
  row: SubmissionRecord,
  patch: z.infer<typeof entryPatchSchema>,
  retentionDays: number | null,
): SubmissionChanges {
  const now = runtime.services.clock.now();
  return {
    updatedAt: now,
    ...(patch.status === undefined ? {} : { status: patch.status }),
    ...(patch.read === undefined ? {} : { readAt: patch.read ? (row.readAt ?? now) : null }),
    ...(patch.spamVerdict === undefined
      ? {}
      : {
          spamVerdict: patch.spamVerdict,
          expiresAt:
            patch.spamVerdict === 'spam'
              ? markedSpamExpiry(row.expiresAt, now)
              : entryExpiry({ retentionDays }, row.createdAt, patch.spamVerdict),
        }),
  };
}

/** Delete optional attachments through the borrowed capability on this exact transaction. */
export async function deleteEntryFiles(runtime: FormsRuntime, id: string) {
  await runtime.capabilities
    .optional('files')
    ?.deleteByOwner(runtime.tx, { type: 'form_submission', id });
}

/** Register bounded entry metadata edits and individual erasure. */
export function formsMutationRoutes(router: ModuleAdminRouter<FormsRuntime>) {
  router.register(
    {
      method: 'PATCH',
      path: '/{key}/submissions/{id}',
      operationId: 'forms.submissions.update',
      input: z.object({ params, query: z.object({}).strict(), body: entryPatchSchema }),
      responses: {
        200: {
          kind: 'json',
          description: 'The entry was updated.',
          schema: submissionAcceptedSchema,
        },
      },
      policy: mutationPolicy('update', 'data:write'),
    },
    async (runtime, input) => {
      const instance = await runtime.instances.get(input.params.key);
      const repository = formsRepository(runtime);
      const row = await repository.get(instance.id, input.params.id, { lock: true });
      await repository.patch(
        instance.id,
        row.id,
        entryChanges(runtime, row, input.body, instance.config.retentionDays),
      );
      await auditEntry(
        runtime,
        FORMS_AUDIT_ACTIONS.submissionUpdated,
        { type: 'form_submission', id: row.id },
        {
          instanceId: instance.id,
          changedFields: Object.keys(input.body),
        },
      );
      return Response.json({ id: row.id });
    },
  );
  router.register(
    {
      method: 'DELETE',
      path: '/{key}/submissions/{id}',
      operationId: 'forms.submissions.delete',
      input: z.object({ params, query: z.object({}).strict(), body: z.null() }),
      responses: { 204: { kind: 'empty', description: 'The entry was erased.' } },
      policy: mutationPolicy('delete', 'data:delete'),
    },
    async (runtime, input) => {
      const instance = await runtime.instances.get(input.params.key);
      const repository = formsRepository(runtime);
      const row = await repository.get(instance.id, input.params.id, { lock: true });
      await deleteEntryFiles(runtime, row.id);
      await repository.delete(instance.id, row.id);
      await auditEntry(
        runtime,
        FORMS_AUDIT_ACTIONS.submissionDeleted,
        { type: 'form_submission', id: row.id },
        {
          instanceId: instance.id,
        },
      );
      return new Response(null, { status: 204 });
    },
  );
}
