import {
  eventDefinitionSchema,
  notificationRecipientSchema,
  notificationRuleCreateSchema,
  notificationRulePatchSchema,
  notificationRuleResponseSchema,
  pageQuerySchema,
  repositoryPage,
  type NotificationRule,
} from '@backbricks/core';
import { createRoute, z } from '@hono/zod-openapi';

import type { ApiRoutes } from '../http/api-routes.ts';
import { requireTenantContext } from '../middleware/authorization.ts';
import type { ServerServices } from '../services.ts';

const params = z.object({ projectId: z.string() }).strict();
const ruleParams = params.extend({ ruleId: z.string().min(1).max(128) });
const json = (schema: z.ZodType, description: string) => ({
  description,
  content: { 'application/json': { schema } },
});
const serialize = (row: NotificationRule) =>
  notificationRuleResponseSchema.parse({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
const policy = (operation: string) => ({
  kind: 'management' as const,
  bodyLimitBytes: 4096,
  session: { role: 'admin' as const },
  isolationCase: `notifications.${operation}`,
});

/** Session-only notification configuration; all data access and mutation logic stay in core. */
export function notificationRuleRoutes(
  api: ApiRoutes,
  services: Pick<ServerServices, 'notificationRules' | 'withTenant'>,
) {
  const path = '/v1/projects/{projectId}/notification-rules';
  api.register(
    createRoute({
      method: 'get',
      path,
      operationId: 'notifications.list',
      request: { params, query: pageQuerySchema },
      responses: {
        200: json(
          z.object({
            data: z.array(notificationRuleResponseSchema),
            nextCursor: z.string().nullable(),
          }),
          'Notification configuration.',
        ),
      },
    }),
    policy('list'),
    async (c) => {
      const page = await services.withTenant(requireTenantContext(c), (tx) =>
        services.notificationRules.list(tx, repositoryPage(c.req.valid('query'))),
      );
      return c.json({ ...page, data: page.data.map(serialize) }, 200);
    },
  );
  api.register(
    createRoute({
      method: 'get',
      path: `${path}/options`,
      operationId: 'notifications.options',
      request: { params },
      responses: {
        200: json(
          z
            .object({
              events: z.array(eventDefinitionSchema),
              recipients: z.array(notificationRecipientSchema),
              emailAvailable: z.boolean(),
            })
            .strict(),
          'Enabled events and verified organization members.',
        ),
      },
    }),
    policy('options'),
    async (c) =>
      c.json(
        await services.withTenant(requireTenantContext(c), (tx) =>
          services.notificationRules.options(tx),
        ),
        200,
      ),
  );
  api.register(
    createRoute({
      method: 'post',
      path,
      operationId: 'notifications.create',
      request: {
        params,
        body: {
          required: true,
          content: { 'application/json': { schema: notificationRuleCreateSchema } },
        },
      },
      responses: { 201: json(notificationRuleResponseSchema, 'Notification rule created.') },
    }),
    policy('create'),
    async (c) =>
      c.json(
        serialize(
          await services.withTenant(requireTenantContext(c), (tx) =>
            services.notificationRules.create(tx, c.req.valid('json')),
          ),
        ),
        201,
      ),
  );
  api.register(
    createRoute({
      method: 'patch',
      path: `${path}/{ruleId}`,
      operationId: 'notifications.update',
      request: {
        params: ruleParams,
        body: {
          required: true,
          content: { 'application/json': { schema: notificationRulePatchSchema } },
        },
      },
      responses: { 200: json(notificationRuleResponseSchema, 'Notification rule updated.') },
    }),
    policy('update'),
    async (c) =>
      c.json(
        serialize(
          await services.withTenant(requireTenantContext(c), (tx) =>
            services.notificationRules.update(tx, c.req.valid('param').ruleId, c.req.valid('json')),
          ),
        ),
        200,
      ),
  );
  api.register(
    createRoute({
      method: 'delete',
      path: `${path}/{ruleId}`,
      operationId: 'notifications.delete',
      request: { params: ruleParams },
      responses: { 204: { description: 'Notification rule removed.' } },
    }),
    policy('delete'),
    async (c) => {
      await services.withTenant(requireTenantContext(c), (tx) =>
        services.notificationRules.delete(tx, c.req.valid('param').ruleId),
      );
      return c.body(null, 204);
    },
  );
}
