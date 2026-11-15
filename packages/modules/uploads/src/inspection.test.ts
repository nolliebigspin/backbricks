import { expect, test } from 'bun:test';

import { AppError } from '@backbricks/core';

import { inspectFinalFile } from './inspection.ts';

const bytes = new TextEncoder().encode('%PDF-1.7\nfixture\n%%EOF');
test('scanner cancellation during an upstream read remains a retryable provider error', async () => {
  let reads = 0;
  const storage = {
    read: async () => {
      const delay = ++reads > 1 ? 30 : 0;
      let canceled = false;
      return new ReadableStream<Uint8Array>({
        async pull(controller) {
          await Bun.sleep(delay);
          if (!canceled) {
            controller.enqueue(bytes);
            controller.close();
          }
        },
        cancel() {
          canceled = true;
        },
      });
    },
  };
  const scanner = {
    scan: async (stream: ReadableStream<Uint8Array>) => {
      await Bun.sleep(1);
      await stream.cancel();
      throw new AppError('service_unavailable');
    },
  };
  expect(
    await inspectFinalFile(
      storage,
      { storageKey: 'test/file', sizeBytes: bytes.length },
      scanner,
    ).catch((error: unknown) => error),
  ).toMatchObject({ code: 'service_unavailable' });
});
test('natural upstream EOF with too few bytes is still rejected', async () => {
  const storage = {
    read: async () =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      }),
  };
  expect(
    await inspectFinalFile(
      storage,
      { storageKey: 'test/file', sizeBytes: bytes.length + 1 },
      null,
    ).catch((error: unknown) => error),
  ).toMatchObject({ code: 'validation_failed' });
});
