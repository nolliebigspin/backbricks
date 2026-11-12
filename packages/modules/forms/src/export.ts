import {
  AppError,
  csvRow,
  MAX_PAGE_SIZE,
  pageResult,
  repositoryPage,
  type ModuleAdminRouter,
  type JsonValue,
} from '@backbricks/core';
import { z } from 'zod';

import { submissionFiltersSchema } from './admin-schemas.ts';
import { FORMS_AUDIT_ACTIONS } from './constants.ts';
import { auditEntry } from './mutations.ts';
import { formKeyParams } from './public.ts';
import { submissionFilters } from './queries.ts';
import { formsRepository, type FormsRuntime } from './runtime.ts';

const cell = (value: JsonValue | undefined) =>
  value === undefined || value === null
    ? ''
    : typeof value === 'object'
      ? JSON.stringify(value)
      : String(value);

/** Export personal data only for authorized admin sessions, in bounded fresh read frames. */
export function formsExportRoutes(router: ModuleAdminRouter<FormsRuntime>) {
  router.register(
    {
      method: 'GET',
      path: '/{key}/export.csv',
      operationId: 'forms.submissions.export',
      input: z.object({ params: formKeyParams, query: submissionFiltersSchema, body: z.null() }),
      responses: {
        200: {
          kind: 'csv',
          description: 'CSV with defused spreadsheet formulas and all historical field columns.',
        },
      },
      policy: {
        kind: 'management',
        bodyLimitBytes: 1024,
        session: { role: 'admin' },
        isolationCase: 'forms.submissions.export',
        rateLimit: { limit: 1, windowMs: 60_000, byParam: 'key' },
      },
    },
    async (runtime, { params, query }) => {
      if (!runtime.streamText) throw new AppError('service_unavailable');
      const instance = await runtime.instances.get(params.key);
      const keys = new Set(instance.config.fields.map((field) => field.key));
      let history: string | undefined;
      do {
        // oxlint-disable-next-line no-await-in-loop -- Revision pages use the preceding opaque cursor.
        const rows = await runtime.instances.revisions(
          params.key,
          repositoryPage({ limit: MAX_PAGE_SIZE, cursor: history }),
        );
        for (const row of rows) for (const field of row.config.fields) keys.add(field.key);
        history = pageResult(rows, MAX_PAGE_SIZE).nextCursor ?? undefined;
      } while (history);
      const columns = [...keys];
      const filters = submissionFilters(query);
      const target = { type: 'module_instance', id: instance.id };
      await auditEntry(runtime, FORMS_AUDIT_ACTIONS.exported, target, {
        count: 0,
        reason: 'started',
      });
      let count = 0;
      const stream = runtime.streamText(
        csvRow([
          'id',
          'created_at',
          'status',
          'read',
          'spam',
          ...columns.map((key) => `data.${key}`),
        ]),
        async (frame, cursor) => {
          const rows = await formsRepository(frame).list(
            instance.id,
            filters,
            repositoryPage({ limit: MAX_PAGE_SIZE, cursor }),
          );
          const page = pageResult(rows, MAX_PAGE_SIZE);
          const text = page.data
            .map((row) =>
              csvRow([
                row.id,
                row.createdAt.toISOString(),
                row.status,
                String(row.readAt !== null),
                row.spamVerdict,
                ...columns.map((key) => cell(row.data[key])),
              ]),
            )
            .join('');
          count += page.data.length;
          if (page.nextCursor === null)
            await auditEntry(frame, FORMS_AUDIT_ACTIONS.exported, target, {
              count,
              reason: 'completed',
            });
          return { text, nextCursor: page.nextCursor };
        },
      );
      return new Response(stream);
    },
  );
}
