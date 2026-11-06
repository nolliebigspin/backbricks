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
          runInTransaction: (tx: TenantTransaction, input: unknown) =>
            job.run(runtime.forTenant(tx).execution(module.type), input),
          run: (context: TenantContext, input: unknown) =>
            withTenant(context, (tx) =>
              job.run(runtime.forTenant(tx).execution(module.type), input),
            ),
        }),
      ),
    ),
  );
}
