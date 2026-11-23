import { copyFile, rm } from 'node:fs/promises';

const root = new URL('../', import.meta.url).pathname;
const outdir = new URL('../dist', import.meta.url).pathname;
await rm(outdir, { recursive: true, force: true });

for (const [entries, splitting] of [
  [['src/index.ts'], true],
  [['admin/index.ts', 'pow/index.ts', 'src/pow-worker.js'], false],
] as const) {
  // Root is isolated so the public client never eagerly imports a shared solver chunk.
  // oxlint-disable-next-line no-await-in-loop -- Both builds write distinct outputs into the same directory.
  const result = await Bun.build({
    entrypoints: entries.map((entry) => `${root}${entry}`),
    root,
    outdir,
    target: 'node',
    format: 'esm',
    splitting,
    external: ['openapi-fetch'],
  });
  if (!result.success) throw new AggregateError(result.logs, 'SDK build failed.');
}
await copyFile(`${outdir}/src/pow-worker.js`, `${outdir}/pow/pow-worker.js`);
