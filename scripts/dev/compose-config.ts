import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { z } from 'zod';
const execute = promisify(execFile);
const compositionSchema = z.object({
  name: z.string(),
  services: z.record(
    z.string(),
    z.object({
      environment: z.record(z.string(), z.string().nullable()).default({}),
      ports: z.array(z.object({ target: z.number() })).default([]),
    }),
  ),
});
/** Read the canonical environment definition without exposing its credential values. */
export async function readComposeConfig(overrides: Record<string, string> = {}) {
  let output: string;
  try {
    output = (
      await execute(
        'docker',
        ['compose', '--profile', 'storage', '--profile', 'scan', 'config', '--format', 'json'],
        { env: { ...process.env, ...overrides }, maxBuffer: 1024 * 1024, timeout: 10000 },
      )
    ).stdout;
  } catch {
    throw new Error('Docker Compose configuration could not be read.');
  }
  return compositionSchema.parse(JSON.parse(output));
}
