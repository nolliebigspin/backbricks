import type { z } from 'zod';

import { AppError } from '../errors/app-error.ts';
import { pageResult, repositoryPage } from '../http/pagination.ts';
import { monthlyUsagePeriod, type UsageService } from '../services/usage.ts';
import type { TenantTransaction } from '../tenancy/tenant-context.ts';
import type { Clock } from '../time/clock.ts';
import {
  type auditQuerySchema,
  auditResponseSchema,
  integrationResponseSchema,
} from './schemas.ts';

/** Read-only platform projections: no identity labels, private network data or secret material. */
export function createPlatformQueries(deps: {
  clock: Clock;
  usage: UsageService;
  publicUrl: string;
}) {
  const baseUrl = new URL('/v1', new URL(deps.publicUrl).origin).href;
  return {
    async activity(tx: TenantTransaction, query: z.infer<typeof auditQuerySchema>) {
      if (tx.context.projectId && query.projectId && tx.context.projectId !== query.projectId)
        throw new AppError('not_found');
      const page = repositoryPage(query);
      const rows = await tx.repositories.audit.list(
        page,
        {
          projectId: query.projectId,
          action: query.action,
          actorType: query.actorType,
          actorId: query.actorId,
        },
        deps.clock.now(),
      );
      const result = pageResult(rows, page.limit);
      return {
        data: result.data.map((row) =>
          auditResponseSchema.parse({
            id: row.id,
            projectId: row.projectId,
            actorType: row.actorType,
            actorId: row.actorId,
            action: row.action,
            targetType: row.targetType,
            targetId: row.targetId,
            changes: row.changes,
            requestId: row.requestId,
            createdAt: row.createdAt.toISOString(),
          }),
        ),
        nextCursor: result.nextCursor,
      };
    },
    async usage(tx: TenantTransaction, period = monthlyUsagePeriod(deps.clock.now())) {
      return {
        period,
        data: (await deps.usage.list(tx, period)).map((row) => ({
          metric: row.metric,
          value: row.value.toString(),
        })),
      };
    },
    async integration(tx: TenantTransaction) {
      if (!tx.context.projectId) throw new AppError('not_found');
      const project = await tx.repositories.projects.get(tx.context.projectId);
      return integrationResponseSchema.parse({
        baseUrl,
        project: {
          id: project.id,
          name: project.name,
          slug: project.slug,
          allowedOrigins: project.allowedOrigins,
        },
        publicKey: await tx.repositories.keys.publishable(deps.clock.now()),
      });
    },
  };
}
export type PlatformQueries = ReturnType<typeof createPlatformQueries>;
