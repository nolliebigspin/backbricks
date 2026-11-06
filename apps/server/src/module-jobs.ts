import type { SelectedModules, TenantContext, WithTenant } from '@backbricks/core';

/** A worker hand-off; pg-boss registration/execution is supplied by P1.10. */
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
          run: (context: TenantContext, input: unknown) =>
            withTenant(context, (tx) =>
              job.run(runtime.forTenant(tx).execution(module.type), input),
            ),
        }),
      ),
    ),
  );
}
