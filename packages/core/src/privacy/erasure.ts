import { z } from 'zod';

import { AppError } from '../errors/app-error.ts';
import type { InstanceDependencies } from '../instances/persistence.ts';
import type { QueueJobHandler } from '../jobs/contract.ts';
import { PLATFORM_JOBS } from '../jobs/platform-names.ts';
import { requireEnabledProjectModules } from '../modules/availability.ts';
import { activityIdentifierSchema } from '../platform/activity-fields.ts';
import type { Queue } from '../services/providers.ts';
import type { TenantTransaction } from '../tenancy/tenant-context.ts';
import { subjectRequestSchema } from './subjects.ts';

const SETTLE_DELAY_MS = 30_000;
const settlePayload = z
  .object({
    operationId: activityIdentifierSchema,
    count: z.number().int().nonnegative(),
    round: z.number().int().min(1).max(1_000_000),
  })
  .strict();
export const SUBJECT_ERASURE_JOB_DEFINITIONS = Object.freeze([
  {
    name: PLATFORM_JOBS.subjectErasure,
    payload: subjectRequestSchema,
    retentionSeconds: 86_400,
    retries: 2,
  },
  {
    name: PLATFORM_JOBS.subjectErasureSettle,
    payload: settlePayload,
    retentionSeconds: 86_400,
    retries: 5,
  },
]);
type Dependencies = Pick<
  InstanceDependencies,
  'registry' | 'runtime' | 'audit' | 'clock' | 'ids'
> & { queue?: Queue };
async function pending(deps: Dependencies, tx: TenantTransaction) {
  let until: Date | null = null;
  for (const module of deps.registry.modules) {
    // oxlint-disable-next-line no-await-in-loop -- Ordered pages and operations share scoped frames; parallel work would break their sequence.
    const value = await module.privacy.pendingErasure?.(
      deps.runtime.forTenant(tx).execution(module.type),
    );
    if (value && (!until || value < until)) until = value;
  }
  return until;
}
async function scope(deps: Dependencies, tx: TenantTransaction) {
  if (!tx.context.projectId) throw new AppError('not_found');
  await tx.repositories.projects.get(tx.context.projectId, { lock: true });
  await requireEnabledProjectModules(tx, deps.registry);
}
async function finish(deps: Dependencies, tx: TenantTransaction, count: number) {
  await deps.audit.record(tx, {
    actorType: 'system',
    action: 'privacy.module_subject_erased',
    changes: { count },
  });
}
async function defer(
  deps: Dependencies,
  tx: TenantTransaction,
  input: z.infer<typeof settlePayload>,
  until: Date,
) {
  if (!deps.queue) throw new AppError('service_unavailable');
  await deps.queue.enqueue(tx, PLATFORM_JOBS.subjectErasureSettle, input, {
    singletonKey: `${input.operationId}:${input.round}`,
    notBefore: new Date(Math.max(deps.clock.now().getTime() + SETTLE_DELAY_MS, until.getTime())),
  });
}
/** Subject identity is consumed once; physical settlement continues with opaque identifiers only. */
export function createSubjectErasureHandlers(deps: Dependencies): readonly QueueJobHandler[] {
  return [
    {
      name: PLATFORM_JOBS.subjectErasure,
      async runInTransaction(this: void, tx, input) {
        const { email } = subjectRequestSchema.parse(input);
        await scope(deps, tx);
        let count = 0;
        for (const module of deps.registry.modules)
          // oxlint-disable-next-line no-await-in-loop -- Ordered pages and operations share scoped frames; parallel work would break their sequence.
          count += await module.privacy.deleteSubject(
            deps.runtime.forTenant(tx).execution(module.type),
            email,
          );
        const until = await pending(deps, tx);
        if (!until) {
          await finish(deps, tx, count);
          return;
        }
        await defer(deps, tx, { operationId: deps.ids.generate('req'), count, round: 1 }, until);
        await deps.audit.record(tx, {
          actorType: 'system',
          action: 'privacy.subject_erasure_pending',
          changes: { count },
        });
      },
    },
    {
      name: PLATFORM_JOBS.subjectErasureSettle,
      async runInTransaction(this: void, tx, input) {
        const data = settlePayload.parse(input);
        await scope(deps, tx);
        const until = await pending(deps, tx);
        if (until) await defer(deps, tx, { ...data, round: data.round + 1 }, until);
        else await finish(deps, tx, data.count);
      },
    },
  ];
}
