import type { z } from 'zod';

export const MAX_JOB_RETENTION_SECONDS = 30 * 24 * 60 * 60;
export type ModuleJobSpec = {
  name: string;
  retentionSeconds: number;
  retries: number;
  cron?: string;
};
/** Registration captures each payload schema's type before heterogeneous jobs are collected. */
export interface ModuleJobRegistrar<Runtime> {
  register<P extends z.ZodType>(
    spec: ModuleJobSpec,
    payload: P,
    handler: (runtime: Runtime, payload: z.output<P>) => Promise<void>,
  ): void;
}
