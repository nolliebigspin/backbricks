import { expect, test } from 'bun:test';

import { unzipSync } from 'fflate';

import { createZipStream, type ZipEntry } from './zip.ts';

async function* entries(): AsyncGenerator<ZipEntry> {
  yield { path: 'files/uploads/file_fixture.bin', size: 3, stream: new Blob(['abc']).stream() };
  yield { path: 'manifest.json', size: 7, stream: new Blob(['{"a":1}']).stream() };
}
test('STORE archives are readable by an independent ZIP reader and commit completion before the end marker', async () => {
  let completed = false;
  const stream = createZipStream(entries(), async () => {
    completed = true;
  });
  expect(completed).toBe(false);
  const data = await new Response(stream).bytes();
  const result = unzipSync(data);
  expect(Object.keys(result)).toEqual(['files/uploads/file_fixture.bin', 'manifest.json']);
  expect(new TextDecoder().decode(result['manifest.json'])).toBe('{"a":1}');
  expect(new TextDecoder().decode(result['files/uploads/file_fixture.bin'])).toBe('abc');
  expect(completed).toBe(true);
});
test('canceling immediately after a local header closes its already opened source and skips completion', async () => {
  let canceled = false,
    completed = false;
  async function* source(): AsyncGenerator<ZipEntry> {
    yield {
      path: 'manifest.json',
      size: 10,
      stream: new ReadableStream<Uint8Array>({
        cancel() {
          canceled = true;
        },
      }),
    };
  }
  const reader = createZipStream(source(), async () => {
    completed = true;
  }).getReader();
  expect((await reader.read()).value?.length).toBeGreaterThan(0);
  await reader.cancel();
  expect(canceled).toBe(true);
  expect(completed).toBe(false);
});
test('a completion audit failure never emits a valid ZIP end marker', async () => {
  const stream = createZipStream(entries(), async () => {
    throw new Error('private commit diagnostic');
  });
  const failure = await new Response(stream).bytes().catch((error: unknown) => error);
  expect(failure).toMatchObject({ code: 'internal_error' });
  expect(String(failure)).not.toContain('private commit diagnostic');
});
test('streaming large contents applies backpressure without allocating the archive', async () => {
  let pulled = 0,
    consumed = 0;
  const chunk = new Uint8Array(64 * 1024);
  const size = chunk.length * 4096;
  async function* source(): AsyncGenerator<ZipEntry> {
    yield {
      path: 'files/uploads/file_large.bin',
      size,
      stream: new ReadableStream<Uint8Array>({
        pull(controller) {
          expect(pulled - consumed).toBeLessThanOrEqual(1);
          if (pulled++ < 4096) controller.enqueue(chunk);
          else controller.close();
        },
      }),
    };
  }
  const reader = createZipStream(source(), async () => {}).getReader();
  let bytes = 0;
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- Pull one bounded chunk at a time to preserve backpressure.
    const result = await reader.read();
    if (result.done) break;
    bytes += result.value.length;
    if (result.value === chunk) consumed++;
  }
  expect(bytes).toBeGreaterThan(size);
  expect(consumed).toBe(4096);
});
