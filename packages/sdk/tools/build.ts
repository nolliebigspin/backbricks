import { rm } from 'node:fs/promises';

await rm(new URL('../dist', import.meta.url), { recursive: true, force: true });
const result = await Bun.build({
  entrypoints: [
    new URL('../src/index.ts', import.meta.url).pathname,
    new URL('../admin/index.ts', import.meta.url).pathname,
  ],
  outdir: new URL('../dist', import.meta.url).pathname,
  target: 'node',
  format: 'esm',
  external: ['openapi-fetch'],
});
if (!result.success) throw new AggregateError(result.logs, 'SDK build failed.');
