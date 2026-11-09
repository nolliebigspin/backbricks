import { z } from 'zod';

import { AppError } from '../errors/app-error.ts';
import { requireSessionRole } from '../identity/permissions.ts';
import { MAX_MAINTENANCE_BATCH, type QueueJobHandler } from '../jobs/contract.ts';
import { PLATFORM_JOBS } from '../jobs/platform-names.ts';
import type { ModuleRegistry } from '../modules/registry.ts';
import { principalActor, type AuditService } from '../services/activity.ts';
import type { Queue } from '../services/providers.ts';
import type { TenantTransaction } from '../tenancy/tenant-context.ts';
import type { Clock } from '../time/clock.ts';
import { PROJECT_SLUG_MAX_LENGTH } from './schemas.ts';

/** Queue adapter ports for erasure; the core never sees the job store (ADR-0061). */
export type ProjectErasurePorts = {
  /** Organization context: queue the erasure job inside the archived project. */
  enqueue(tx: TenantTransaction, projectId: string): Promise<void>;
  /** Archived-project context: delete the project's job payloads except the running job. */
  purgeJobs(tx: TenantTransaction): Promise<number>;
};

export const projectErasureRequestSchema = z
  .object({
    projectId: z.string().min(1).max(128),
    /** Type-to-confirm: the project's slug. */
    confirm: z.string().max(PROJECT_SLUG_MAX_LENGTH),
  })
  .strict();
export const projectErasureResponseSchema = z.object({ status: z.literal('queued') }).strict();
export const projectErasurePayloadSchema = z
  .object({ round: z.number().int().min(1).max(1_000_000).optional() })
  .strict();
export const PROJECT_ERASURE_JOB_DEFINITION = Object.freeze({
  name: PLATFORM_JOBS.projectErasure,
  payload: projectErasurePayloadSchema,
  retries: 5,
  retentionSeconds: 86_400,
});

/** The tombstone slug keeps the per-organization slug reservation without the chosen name. */
export const erasedProjectSlug = (projectId: string) =>
  `erased-${projectId.replace(/^prj_/, '').toLowerCase()}`;

/** Owner-only request; the job does the work in bounded, resumable rounds. */
export function createProjectErasureService(deps: {
  audit: AuditService;
  ports?: ProjectErasurePorts;
}) {
  return {
    async request(tx: TenantTransaction, input: z.input<typeof projectErasureRequestSchema>) {
      const principal = requireSessionRole(tx, 'owner');
      if (tx.context.projectId) throw new AppError('forbidden');
      const data = projectErasureRequestSchema.parse(input);
      const project = await tx.repositories.projects.get(data.projectId, {
        includeArchived: true,
        lock: true,
      });
      if (await tx.repositories.projects.erasedAt(project.id)) throw new AppError('not_found');
      if (!project.deletedAt)
        throw new AppError('conflict', { detail: 'Archive the project before erasing it.' });
      if (data.confirm !== project.slug)
        throw new AppError('validation_failed', {
          detail: "Type the project's slug to confirm.",
          errors: [{ path: 'confirm', code: 'invalid_option', message: 'Does not match.' }],
        });
      if (!deps.ports) throw new AppError('service_unavailable');
      await deps.ports.enqueue(tx, project.id);
      await deps.audit.record(tx, {
        ...principalActor(principal),
        action: 'project.erasure_requested',
        targetType: 'project',
        targetId: project.id,
      });
      return projectErasureResponseSchema.parse({ status: 'queued' });
    },
  };
}
export type ProjectErasureService = ReturnType<typeof createProjectErasureService>;

/**
 * Erasure worker: every module's `privacy.eraseScope` in bounded rounds (a full batch queues the
 * next round and commits), then platform rows, queued job payloads and the tombstone.
 */
export function createProjectErasureHandler(deps: {
  registry: ModuleRegistry;
  runtime: ReturnType<ModuleRegistry['bind']>;
  clock: Clock;
  audit: AuditService;
  queue?: Queue;
  ports?: ProjectErasurePorts;
}): QueueJobHandler {
  return {
    name: PLATFORM_JOBS.projectErasure,
    async runInTransaction(this: void, tx, input) {
      const data = projectErasurePayloadSchema.parse(input);
      const projectId = tx.context.projectId;
      if (!tx.context.archivedProject || !projectId) throw new AppError('not_found');
      await tx.repositories.projects.get(projectId, { includeArchived: true, lock: true });
      if (await tx.repositories.projects.erasedAt(projectId)) return;
      let records = 0;
      let full = false;
      for (const module of deps.registry.modules) {
        // oxlint-disable-next-line no-await-in-loop -- Every module erases in this transaction.
        const erased = await module.privacy.eraseScope(
          deps.runtime.forTenant(tx).execution(module.type),
          { limit: MAX_MAINTENANCE_BATCH },
        );
        records += erased;
        full ||= erased === MAX_MAINTENANCE_BATCH;
      }
      const round = data.round ?? 1;
      if (full) {
        if (!deps.queue) throw new AppError('service_unavailable');
        await deps.queue.enqueue(
          tx,
          PLATFORM_JOBS.projectErasure,
          { round: round + 1 },
          { singletonKey: `erase:${round + 1}` },
        );
        return;
      }
      if (!deps.ports) throw new AppError('service_unavailable');
      records += await tx.repositories.projects.eraseRecords();
      const jobs = await deps.ports.purgeJobs(tx);
      await tx.repositories.projects.tombstone({
        slug: erasedProjectSlug(projectId),
        now: deps.clock.now(),
      });
      await deps.audit.record(tx, {
        actorType: 'system',
        action: 'project.erased',
        targetType: 'project',
        targetId: projectId,
        changes: { count: records + jobs },
      });
    },
  };
}
