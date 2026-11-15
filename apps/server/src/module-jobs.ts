import { PLATFORM_JOB_DEFINITIONS } from '@backbricks/core';
import type {
  SelectedModules,
  TenantContext,
  TenantTransaction,
  WithTenant,
} from '@backbricks/core';

/** Selected handlers support direct invocation and atomic queue completion in the caller transaction. */
export function moduleJobs(
  modules: SelectedModules,
  runtime: ReturnType<SelectedModules['registry']['bind']>,
  withTenant: WithTenant,
) {
  async function run(
    tx: TenantTransaction,
    moduleType: string,
    job: SelectedModules['registry']['modules'][number]['jobs'][number],
    input: unknown,
  ) {
    if (tx.context.projectId)
      await tx.repositories.projects.get(tx.context.projectId, {
        lock: true,
        includeArchived: tx.context.archivedProject,
      });
    return job.run(runtime.forTenant(tx).execution(moduleType), input);
  }
  return Object.freeze(
    modules.registry.modules.flatMap((module) =>
      module.jobs.map((job) =>
        Object.freeze({
          name: job.name,
          moduleType: module.type,
          payload: job.payload,
          retries: job.retries,
          retentionSeconds: job.retentionSeconds,
          cron: job.cron,
          consumes: job.consumes,
          runInTransaction: (tx: TenantTransaction, input: unknown) =>
            run(tx, module.type, job, input),
          run: (context: TenantContext, input: unknown) =>
            withTenant(context, (tx) => run(tx, module.type, job, input)),
        }),
      ),
    ),
  );
}

/** Queue storage policies are projected from the same selected registrations as worker callbacks. */
export function moduleJobDefinitions(modules: SelectedModules) {
  return [
    ...PLATFORM_JOB_DEFINITIONS,
    ...modules.registry.modules.flatMap((module) =>
      module.jobs.map((job) => ({
        name: job.name,
        retries: job.retries,
        retentionSeconds: job.retentionSeconds,
        payload: job.payload,
      })),
    ),
  ];
}
