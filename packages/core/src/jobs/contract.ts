import { z } from 'zod';

import { MAX_JOB_RETENTION_SECONDS } from '../modules/jobs.ts';
import { activityIdentifierSchema, activityNameSchema } from '../platform/activity-fields.ts';
import type { TenantTransaction } from '../tenancy/tenant-context.ts';

export const MAX_MAINTENANCE_BATCH = 100;
export const QUEUE_STOP_TIMEOUT_MS = 65_000;
export const PROCESS_SHUTDOWN_TIMEOUT_MS = 75_000;
export const queueJobDefinitionSchema = z
  .object({
    name: activityNameSchema,
    retries: z.number().int().min(0).max(10),
    retentionSeconds: z.number().int().min(1).max(MAX_JOB_RETENTION_SECONDS),
  })
  .strict();
export const queueEnvelopeSchema = z
  .object({
    organizationId: activityIdentifierSchema,
    projectId: activityIdentifierSchema.optional(),
    /** Only the project erasure job runs inside an archived project (ADR-0061). */
    archivedProject: z.literal(true).optional(),
    payload: z.unknown(),
  })
  .strict();
export type QueueJobDefinition = z.infer<typeof queueJobDefinitionSchema> & { payload: z.ZodType };
/** Worker callbacks receive a scoped transaction; the adapter completes the job in that same transaction. */
export type QueueJobHandler = {
  name: string;
  consumes?: readonly string[];
  runInTransaction(this: void, tx: TenantTransaction, payload: unknown): Promise<void>;
};
/** Trusted worker fan-out port; modules receive only Queue.enqueue bound to their current project. */
export type ProjectJobEnqueue = (
  tx: TenantTransaction,
  input: { projectId: string; name: string; payload: unknown; singletonKey: string },
) => Promise<string | null>;
