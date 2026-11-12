// Bundles the SDK for the browser into dist/, where sdk.html's import map expects it.
// Once the SDK is on npm (M5), a CDN URL or your bundler replaces this step.
import { rm } from 'node:fs/promises';

const outdir = new URL('dist', import.meta.url).pathname;
await rm(outdir, { recursive: true, force: true });
const result = await Bun.build({
  entrypoints: [Bun.resolveSync('@backbricks/sdk', import.meta.dir)],
  outdir,
  target: 'browser',
  format: 'esm',
  naming: 'backbricks-sdk.js',
});
if (!result.success) throw new AggregateError(result.logs, 'SDK bundle failed.');
