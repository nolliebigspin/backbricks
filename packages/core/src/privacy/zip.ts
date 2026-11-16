import { crc32 } from 'node:zlib';

import { AppError } from '../errors/app-error.ts';
import { SUBJECT_EXPORT_LIMITS } from './limits.ts';

/** Inputs use generated paths and declare exact sizes; an unavailable file is omitted by the planner. */
export type ZipEntry = { path: string; size: number; stream: ReadableStream<Uint8Array> };
const encoder = new TextEncoder();
const ZIP_LIMITS = {
  entries: SUBJECT_EXPORT_LIMITS.records + 1,
  bytes: SUBJECT_EXPORT_LIMITS.archiveBytes,
} as const;
function header(size: number, signature: number) {
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, signature, true);
  return { bytes, view };
}
function local(name: Uint8Array) {
  const { bytes, view } = header(30 + name.length, 0x04034b50);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0x0808, true);
  view.setUint16(12, 0x21, true);
  view.setUint16(26, name.length, true);
  bytes.set(name, 30);
  return bytes;
}
function central(name: Uint8Array, size: number, crc: number, offset: number) {
  const { bytes, view } = header(46 + name.length, 0x02014b50);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0x0808, true);
  view.setUint16(14, 0x21, true);
  view.setUint32(16, crc, true);
  view.setUint32(20, size, true);
  view.setUint32(24, size, true);
  view.setUint16(28, name.length, true);
  view.setUint32(42, offset, true);
  bytes.set(name, 46);
  return bytes;
}

/** STORE ZIP32 with data descriptors, pull backpressure and a commit barrier before the end marker. */
export function createZipStream(
  entries: AsyncIterable<ZipEntry>,
  beforeFinish: () => Promise<void>,
) {
  let canceled = false;
  let cancelActive: (() => Promise<void>) | undefined;
  async function* archive() {
    const directory: Uint8Array[] = [];
    const names = new Set<string>();
    let offset = 0;
    try {
      for await (const entry of entries) {
        if (canceled) {
          await entry.stream.cancel();
          return;
        }
        if (
          !/^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.(?:bin|json)$/.test(entry.path) ||
          names.has(entry.path) ||
          names.size >= ZIP_LIMITS.entries ||
          !Number.isSafeInteger(entry.size) ||
          entry.size < 0
        )
          throw new AppError('internal_error');
        names.add(entry.path);
        const name = encoder.encode(entry.path);
        const start = offset;
        const first = local(name);
        offset += first.length;
        const reader = entry.stream.getReader();
        cancelActive = () => reader.cancel().catch(() => undefined);
        let size = 0,
          crc = 0;
        try {
          yield first;
          for (;;) {
            // oxlint-disable-next-line no-await-in-loop -- Pull one bounded chunk at a time to preserve backpressure.
            const part = await reader.read();
            if (canceled) return;
            if (part.done) break;
            size += part.value.length;
            offset += part.value.length;
            if (size > entry.size || offset > ZIP_LIMITS.bytes)
              throw new AppError('payload_too_large');
            crc = crc32(part.value, crc);
            yield part.value;
          }
          if (size !== entry.size) throw new AppError('service_unavailable');
        } finally {
          await reader.cancel().catch(() => undefined);
          reader.releaseLock();
          cancelActive = undefined;
        }
        const { bytes, view } = header(16, 0x08074b50);
        view.setUint32(4, crc, true);
        view.setUint32(8, size, true);
        view.setUint32(12, size, true);
        offset += bytes.length;
        directory.push(central(name, size, crc, start));
        yield bytes;
      }
      if (canceled) return;
      const start = offset;
      for (const part of directory) {
        offset += part.length;
        yield part;
      }
      await beforeFinish();
      if (canceled) return;
      const { bytes, view } = header(22, 0x06054b50);
      view.setUint16(8, directory.length, true);
      view.setUint16(10, directory.length, true);
      view.setUint32(12, offset - start, true);
      view.setUint32(16, start, true);
      yield bytes;
    } finally {
      await cancelActive?.();
    }
  }
  const iterator = archive();
  return new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        try {
          const next = await iterator.next();
          if (canceled) return;
          if (next.done) controller.close();
          else controller.enqueue(next.value);
        } catch (error) {
          if (!canceled)
            controller.error(error instanceof AppError ? error : new AppError('internal_error'));
        }
      },
      async cancel() {
        canceled = true;
        await cancelActive?.();
        await iterator.return(undefined);
      },
    },
    { highWaterMark: 0 },
  );
}
