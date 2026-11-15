import { expect, test } from 'bun:test';

import { FILE_SIZE_LIMITS } from '@backbricks/core';

import {
  clamavAvailable,
  clamavTestConfig,
  EICAR_TEST_BYTES,
} from '../../../../scripts/test/clamav.ts';
import { createClamavScanner } from './clamav.ts';

const streamOf = (bytes: Uint8Array) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });

const available = await clamavAvailable();
test.skipIf(!available)(
  'real ClamAV distinguishes clean and EICAR INSTREAM contents',
  async () => {
    const scanner = createClamavScanner(clamavTestConfig);
    expect(
      await scanner.scan(streamOf(new TextEncoder().encode('%PDF-1.7\nclean\n%%EOF'))),
    ).toEqual({
      status: 'clean',
    });
    const infected = await scanner.scan(streamOf(EICAR_TEST_BYTES));
    expect(infected.status).toBe('infected');
    if (infected.status === 'infected') expect(infected.signature.toUpperCase()).toContain('EICAR');
  },
  30_000,
);

test.skipIf(!available)(
  'real ClamAV accepts the full upload ceiling without buffering a full file',
  async () => {
    const size = FILE_SIZE_LIMITS.maxSizeMb * FILE_SIZE_LIMITS.bytesPerMb;
    const chunk = new Uint8Array(64 * 1024).fill(97);
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent === size) {
          controller.close();
          return;
        }
        sent += chunk.byteLength;
        controller.enqueue(chunk);
      },
    });
    expect(await createClamavScanner(clamavTestConfig).scan(stream)).toEqual({ status: 'clean' });
    expect(sent).toBe(size);
  },
  60_000,
);
