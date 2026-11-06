import { AppError } from '../errors/app-error.ts';
import type { Ids } from '../ids/type-id.ts';
import type { Project } from '../platform/models.ts';
import { principalActor, type AuditService, type EventService } from '../services/activity.ts';
import type { TenantTransaction } from '../tenancy/tenant-context.ts';
import type { Clock } from '../time/clock.ts';
import {
  projectCreateSchema,
  projectPatchSchema,
  type ProjectCreate,
  type ProjectPatch,
} from './schemas.ts';

/** Project lifecycle logic; callers supply the same tenant transaction to data, audit and events. */
export function createProjectService(deps: {
  clock: Clock;
  ids: Ids;
  audit: AuditService;
  events: EventService;
}) {
  async function record(
    tx: TenantTransaction,
    action: string,
    project: Project,
    changedFields: string[],
    requestId?: string,
  ) {
    const principal = tx.context.principal;
    if (!principal) throw new AppError('unauthorized');
    await deps.audit.record(tx, {
      ...principalActor(principal),
      action,
      targetType: 'project',
      targetId: project.id,
      changes: { changedFields },
      requestId,
    });
    await deps.events.publish(tx, {
      type: action,
      subjectType: 'project',
      subjectId: project.id,
      payload: { changedFields },
    });
  }
  return {
    async create(
      tx: TenantTransaction,
      input: ProjectCreate,
      requestId?: string,
    ): Promise<Project> {
      const data = projectCreateSchema.parse(input);
      if (tx.context.projectId) throw new AppError('forbidden');
      const now = deps.clock.now();
      const project = await tx.repositories.projects.insert({
        ...data,
        id: deps.ids.generate('prj'),
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
      await record(tx, 'project.created', project, Object.keys(data), requestId);
      return project;
    },
    async update(
      tx: TenantTransaction,
      id: string,
      input: ProjectPatch,
      requestId?: string,
    ): Promise<Project> {
      const data = projectPatchSchema.parse(input);
      const previous = await tx.repositories.projects.get(id, { lock: true });
      const changedFields = projectCreateSchema
        .keyof()
        .options.filter(
          (key) =>
            data[key] !== undefined && JSON.stringify(previous[key]) !== JSON.stringify(data[key]),
        );
      if (changedFields.length === 0) return previous;
      const project = await tx.repositories.projects.update(id, {
        ...data,
        updatedAt: deps.clock.now(),
      });
      await record(tx, 'project.updated', project, changedFields, requestId);
      return project;
    },
    async archive(tx: TenantTransaction, id: string, requestId?: string): Promise<void> {
      await tx.repositories.projects.get(id, { lock: true });
      const now = deps.clock.now();
      const project = await tx.repositories.projects.update(id, { deletedAt: now, updatedAt: now });
      await record(tx, 'project.archived', project, ['deletedAt'], requestId);
    },
  };
}
export type ProjectService = ReturnType<typeof createProjectService>;
