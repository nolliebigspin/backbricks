// Bundle the public client and its worker into the import map's directory.
import { rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const outdir = new URL('dist', import.meta.url).pathname;
const client = Bun.resolveSync('@backbricks/sdk', import.meta.dir);
await rm(outdir, { recursive: true, force: true });
const builds = await Promise.all([
  Bun.build({
    entrypoints: [client],
    outdir,
    target: 'browser',
    format: 'esm',
    naming: 'backbricks-sdk.js',
  }),
  Bun.build({
    entrypoints: [join(dirname(client), 'pow-worker.js')],
    outdir,
    target: 'browser',
    format: 'esm',
  }),
]);
for (const result of builds)
  if (!result.success) throw new AggregateError(result.logs, 'SDK bundle failed.');
