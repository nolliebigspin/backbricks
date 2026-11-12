import {
  AppError,
  bulkIdsSchema,
  MAX_MAINTENANCE_BATCH,
  type ModuleAdminRouter,
  type ModuleJobRegistrar,
} from '@backbricks/core';
import { z } from 'zod';

import { FORMS_AUDIT_ACTIONS, FORMS_JOBS } from './constants.ts';
import { auditEntry, deleteEntryFiles, entryChanges, mutationPolicy } from './mutations.ts';
import { formKeyParams } from './public.ts';
import { formsRepository, type FormsRuntime } from './runtime.ts';

const countSchema = z.object({ count: z.number().int().nonnegative() }).strict();
const actionSchema = z.enum(['read', 'unread', 'done', 'open', 'spam', 'not_spam']);
const deleteAllPayload = z
  .object({
    instanceId: z.string().min(1).max(128),
    deletedCount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).default(0),
  })
  .strict();

/** Both bulk mutation paths lock and validate the complete ID set before changing any row. */
export function formsBulkRoutes(router: ModuleAdminRouter<FormsRuntime>) {
  router.register(
    {
      method: 'POST',
      path: '/{key}/submissions/bulk',
      operationId: 'forms.submissions.bulk',
      input: z.object({
        params: formKeyParams,
        query: z.object({}).strict(),
        body: z.object({ ids: bulkIdsSchema, action: actionSchema }).strict(),
      }),
      responses: {
        200: {
          kind: 'json',
          description: 'All selected entries were updated.',
          schema: countSchema,
        },
      },
      policy: mutationPolicy('bulk', 'data:write', 'member', 8192),
    },
    async (runtime, { params, body }) => {
      const instance = await runtime.instances.get(params.key);
      const repository = formsRepository(runtime);
      await repository.bulkPatch(instance.id, body.ids, {
        updatedAt: runtime.services.clock.now(),
      });
      const action = body.action;
      const patch =
        action === 'read' || action === 'unread'
          ? { read: action === 'read' }
          : action === 'open' || action === 'done'
            ? { status: action }
            : { spamVerdict: action === 'spam' ? ('spam' as const) : ('clean' as const) };
      for (const id of body.ids) {
        // oxlint-disable-next-line no-await-in-loop -- Rows remain locked in the caller's single transaction.
        const row = await repository.get(instance.id, id);
        // oxlint-disable-next-line no-await-in-loop -- Expiry/read timestamps depend on each locked row.
        await repository.patch(
          instance.id,
          id,
          entryChanges(runtime, row, patch, instance.config.retentionDays),
        );
      }
      await auditEntry(
        runtime,
        FORMS_AUDIT_ACTIONS.bulkUpdated,
        { type: 'module_instance', id: instance.id },
        { count: body.ids.length, changedFields: Object.keys(patch) },
      );
      return Response.json({ count: body.ids.length });
    },
  );
  router.register(
    {
      method: 'POST',
      path: '/{key}/submissions/bulk-delete',
      operationId: 'forms.submissions.bulk_delete',
      input: z.object({
        params: formKeyParams,
        query: z.object({}).strict(),
        body: z.object({ ids: bulkIdsSchema }).strict(),
      }),
      responses: {
        200: {
          kind: 'json',
          description: 'All selected entries were erased.',
          schema: countSchema,
        },
      },
      policy: mutationPolicy('bulk_delete', 'data:delete', 'admin', 8192),
    },
    async (runtime, { params, body }) => {
      const instance = await runtime.instances.get(params.key);
      const repository = formsRepository(runtime);
      await repository.bulkPatch(instance.id, body.ids, {
        updatedAt: runtime.services.clock.now(),
      });
      for (const id of body.ids)
        // oxlint-disable-next-line no-await-in-loop -- File deletion borrows the same transaction as every selected entry.
        await deleteEntryFiles(runtime, id);
      const count = await repository.bulkDelete(instance.id, body.ids);
      await auditEntry(
        runtime,
        FORMS_AUDIT_ACTIONS.bulkDeleted,
        { type: 'module_instance', id: instance.id },
        { count },
      );
      return Response.json({ count });
    },
  );
  router.register(
    {
      method: 'POST',
      path: '/{key}/submissions/delete-all',
      operationId: 'forms.submissions.delete_all',
      input: z.object({
        params: formKeyParams,
        query: z.object({}).strict(),
        body: z.object({ confirm: z.string().min(1).max(63) }).strict(),
      }),
      responses: {
        202: {
          kind: 'json',
          description: 'Bounded erasure was queued.',
          schema: z.object({ accepted: z.literal(true) }).strict(),
        },
      },
      policy: {
        kind: 'management',
        bodyLimitBytes: 1024,
        session: { role: 'admin' },
        isolationCase: 'forms.submissions.delete_all',
      },
    },
    async (runtime, { params, body }) => {
      const instance = await runtime.instances.get(params.key);
      if (body.confirm !== params.key) throw new AppError('validation_failed');
      const queue = runtime.services.optional('queue');
      if (!queue) throw new AppError('service_unavailable');
      await queue.enqueue(runtime.tx, FORMS_JOBS.deleteAll, {
        instanceId: instance.id,
        deletedCount: 0,
      });
      await auditEntry(runtime, FORMS_AUDIT_ACTIONS.deleteAllRequested, {
        type: 'module_instance',
        id: instance.id,
      });
      return Response.json({ accepted: true }, { status: 202 });
    },
  );
}

/** Each job commits one bounded batch and its continuation/audit together; retries cannot double-count. */
export function formsJobs(registrar: ModuleJobRegistrar<FormsRuntime>) {
  registrar.register(
    { name: FORMS_JOBS.deleteAll, retentionSeconds: 86_400, retries: 3 },
    deleteAllPayload,
    async (runtime, payload) => {
      const repository = formsRepository(runtime);
      const ids = await repository.deleteBatch(payload.instanceId, MAX_MAINTENANCE_BATCH);
      for (const id of ids)
        // oxlint-disable-next-line no-await-in-loop -- Optional attachment cleanup shares this batch transaction.
        await deleteEntryFiles(runtime, id);
      const deletedCount = payload.deletedCount + ids.length;
      if ((await repository.counts(payload.instanceId)).total > 0) {
        const queue = runtime.services.optional('queue');
        if (!queue) throw new AppError('service_unavailable');
        await queue.enqueue(
          runtime.tx,
          FORMS_JOBS.deleteAll,
          { instanceId: payload.instanceId, deletedCount },
          { notBefore: new Date(runtime.services.clock.now().getTime() + 1000) },
        );
      } else {
        await auditEntry(
          runtime,
          FORMS_AUDIT_ACTIONS.deletedAll,
          { type: 'module_instance', id: payload.instanceId },
          { count: deletedCount },
          true,
        );
      }
    },
  );
}
