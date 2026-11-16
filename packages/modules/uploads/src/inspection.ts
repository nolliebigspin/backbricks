import { createHash } from 'node:crypto';

import { AppError, type Scanner, type StorageAdapter } from '@backbricks/core';
import { fileTypeFromTokenizer } from 'file-type';
import { fromWebStream } from 'strtok3/core';

import { UPLOAD_INSPECTION } from './constants.ts';
import { UPLOAD_FORMATS } from './formats.ts';
import { inspectOfficePackage } from './office.ts';
import type { UploadRecord } from './repository.ts';

/** Size checks and optional hashing share one bounded pass; no tee can queue an entire file. */
function boundedBytes(
  stream: ReadableStream<Uint8Array>,
  size: number,
  signal: AbortSignal,
  hash?: ReturnType<typeof createHash>,
) {
  const reader = stream.getReader();
  let count = 0;
  let invalidSize = false;
  let canceled = false;
  let released = false;
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener('abort', abort, { once: true });
  const stop = () => {
    if (released) return;
    released = true;
    signal.removeEventListener('abort', abort);
    reader.releaseLock();
  };
  const output = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        signal.throwIfAborted();
        const { done, value } = await reader.read();
        if (canceled) return;
        signal.throwIfAborted();
        if (done) {
          invalidSize = count !== size;
          if (invalidSize) throw new AppError('validation_failed');
          stop();
          controller.close();
          return;
        }
        count += value.byteLength;
        invalidSize = count > size;
        if (invalidSize) throw new AppError('validation_failed');
        hash?.update(value);
        controller.enqueue(value);
      } catch (error) {
        void reader.cancel().catch(() => {});
        stop();
        controller.error(error);
      }
    },
    async cancel() {
      canceled = true;
      try {
        await reader.cancel();
      } finally {
        stop();
      }
    },
  });
  return { stream: output, sizeMismatch: () => invalidSize };
}
/** Inspect only the immutable final key. Independent reads avoid an unbounded tee between consumers. */
export async function inspectFinalFile(
  storage: Pick<StorageAdapter, 'read'>,
  file: Pick<UploadRecord, 'storageKey' | 'sizeBytes'>,
  scanner: Scanner | null,
) {
  const signal = AbortSignal.timeout(UPLOAD_INSPECTION.timeoutMs);
  const tokenizer = fromWebStream(
    boundedBytes(await storage.read(file.storageKey), file.sizeBytes, signal).stream,
    {
      fileInfo: { size: file.sizeBytes },
      maxBufferSize: UPLOAD_INSPECTION.tokenizerBytes,
      abortSignal: signal,
    },
  );
  let detectedMime: string | null = null;
  try {
    detectedMime = (await fileTypeFromTokenizer(tokenizer))?.mime ?? null;
  } catch (error) {
    if (error instanceof AppError) throw error;
  } finally {
    await tokenizer.close();
  }
  const format = UPLOAD_FORMATS.find((entry) => entry.mime === detectedMime);
  let allowedPackage = true;
  if (format && 'mainPart' in format) {
    allowedPackage = await inspectOfficePackage(
      boundedBytes(await storage.read(file.storageKey), file.sizeBytes, signal).stream,
      file.sizeBytes,
      format.mime,
      format.mainPart,
    );
  }
  const hash = createHash('sha256');
  const source = boundedBytes(await storage.read(file.storageKey), file.sizeBytes, signal, hash);
  let infected = false;
  try {
    if (scanner) infected = (await scanner.scan(source.stream)).status === 'infected';
    else {
      const reader = source.stream.getReader();
      try {
        for (;;) {
          // oxlint-disable-next-line no-await-in-loop -- Drain/hash one bounded chunk at a time without a scanner.
          if ((await reader.read()).done) break;
        }
      } finally {
        reader.releaseLock();
      }
    }
  } catch (error) {
    if (source.sizeMismatch()) throw new AppError('validation_failed');
    throw error;
  }
  return { detectedMime, sha256: hash.digest(), infected, allowedPackage };
}
