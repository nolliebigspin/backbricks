import {
  pageResult,
  repositoryPage,
  type JsonValue,
  type ModuleAdminRouter,
} from '@backbricks/core';
import { z } from 'zod';

import {
  submissionDetailSchema,
  submissionItemSchema,
  submissionListSchema,
  submissionsQuerySchema,
  submissionSummarySchema,
} from './admin-schemas.ts';
import type { FormsConfig } from './config.ts';
import { formKeyParams, publicForm } from './public.ts';
import { submissionFilters } from './queries.ts';
import type { SubmissionRecord } from './repository.ts';
import { formsRepository, type FormsRuntime } from './runtime.ts';

/** List projections keep only the owner's chosen key fields. */
function listKeys(config: FormsConfig) {
  return (
    config.listFields ??
    config.fields
      .filter((field) => !['hidden', 'consent', 'file'].includes(field.type))
      .slice(0, 2)
      .map((field) => field.key)
  );
}
function select(data: Readonly<Record<string, JsonValue>>, keys: readonly string[]) {
  return Object.fromEntries(Object.entries(data).filter(([key]) => keys.includes(key)));
}
function item(row: SubmissionRecord, data: Readonly<Record<string, JsonValue>>) {
  return submissionItemSchema.parse({
    id: row.id,
    configVersion: row.configVersion,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    status: row.status,
    read: row.readAt !== null,
    spamVerdict: row.spamVerdict,
    isTest: row.isTest,
    data,
  });
}
const policy = (operation: string, scope: 'data:read' | 'stats:read') => ({
  kind: 'management' as const,
  bodyLimitBytes: 1024,
  session: { role: 'member' as const },
  secretKey: { scope },
  isolationCase: `forms.${operation}`,
});

/** Register form data reads with explicit tenant/session/key policies and response projections. */
export function formsAdminRoutes(router: ModuleAdminRouter<FormsRuntime>) {
  router.register(
    {
      method: 'GET',
      path: '/{key}/summary',
      operationId: 'forms.summary',
      input: z.object({ params: formKeyParams, query: z.object({}).strict(), body: z.null() }),
      responses: {
        200: {
          kind: 'json',
          description: 'Counts only, without personal data.',
          schema: submissionSummarySchema,
        },
      },
      policy: policy('summary', 'stats:read'),
    },
    async (runtime, { params }) => {
      const instance = await runtime.instances.get(params.key);
      return Response.json(await formsRepository(runtime).counts(instance.id));
    },
  );
  router.register(
    {
      method: 'GET',
      path: '/{key}/submissions',
      operationId: 'forms.submissions.list',
      input: z.object({ params: formKeyParams, query: submissionsQuerySchema, body: z.null() }),
      responses: {
        200: {
          kind: 'json',
          description: 'A bounded page with selected key fields only.',
          schema: submissionListSchema,
        },
      },
      policy: policy('submissions.list', 'data:read'),
    },
    async (runtime, { params, query }) => {
      const instance = await runtime.instances.get(params.key);
      const rows = await formsRepository(runtime).list(
        instance.id,
        submissionFilters(query),
        repositoryPage(query),
      );
      const page = pageResult(rows, query.limit);
      return Response.json({
        ...page,
        data: page.data.map((row) => item(row, select(row.data, listKeys(instance.config)))),
      });
    },
  );
  router.register(
    {
      method: 'GET',
      path: '/{key}/submissions/{id}',
      operationId: 'forms.submissions.read',
      input: z.object({
        params: formKeyParams.extend({ id: z.string().min(1).max(128) }),
        query: z.object({}).strict(),
        body: z.null(),
      }),
      responses: {
        200: {
          kind: 'json',
          description: 'An entry with its historical field definitions.',
          schema: submissionDetailSchema,
        },
      },
      policy: policy('submissions.read', 'data:read'),
    },
    async (runtime, { params }) => {
      const instance = await runtime.instances.get(params.key);
      const row = await formsRepository(runtime).get(instance.id, params.id);
      const historical = await runtime.instances.revision(params.key, row.configVersion);
      const keys = historical.config.fields
        .map((field) => field.key)
        .filter((key) => instance.config.fields.some((field) => field.key === key));
      return Response.json({
        ...item(row, select(row.data, keys)),
        fields: publicForm(params.key, historical.config).fields,
        additionalData: Object.fromEntries(
          Object.entries(row.data).filter(([key]) => !keys.includes(key)),
        ),
        source: row.source,
        spamReasons: row.spamReasons,
        expiresAt: row.expiresAt?.toISOString() ?? null,
      });
    },
  );
}
