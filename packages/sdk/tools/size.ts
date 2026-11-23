import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const outdir = await mkdtemp(join(tmpdir(), 'backbricks-sdk-size-'));
try {
  const result = await Bun.build({
    entrypoints: [new URL('../src/index.ts', import.meta.url).pathname],
    target: 'browser',
    minify: true,
    splitting: true,
    outdir,
  });
  if (!result.success) throw new AggregateError(result.logs, 'Browser SDK bundle failed.');
  const entry = result.outputs.find((file) => file.kind === 'entry-point');
  if (!entry) throw new Error('Browser SDK entry missing.');
  const bytes = gzipSync(new Uint8Array(await entry.arrayBuffer())).byteLength;
  if (bytes >= 8_000)
    throw new Error(`Browser SDK root uses ${bytes} bytes gzipped (limit 8,000).`);
  process.stdout.write(`Browser SDK root uses ${bytes} bytes gzipped.\n`);
} finally {
  await rm(outdir, { recursive: true, force: true });
}
