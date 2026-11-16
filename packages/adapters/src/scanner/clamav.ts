import { createConnection } from 'node:net';

import { AppError, FILE_SIZE_LIMITS, type Scanner, type ScannerConfig } from '@backbricks/core';

const SCAN_TIMEOUT_MS = 30_000;
const CHUNK_BYTES = 64 * 1024;
const MAX_REPLY_BYTES = 1024;
const MAX_FILE_BYTES = FILE_SIZE_LIMITS.maxSizeMb * FILE_SIZE_LIMITS.bytesPerMb;
const unavailable = () => new AppError('service_unavailable');

/** Clamd's NUL-framed INSTREAM protocol; all file bytes are streamed over one bounded connection. */
export function createClamavScanner(
  config: Extract<ScannerConfig, { kind: 'clamav' }>,
  options: { timeoutMs?: number; maxBytes?: number } = {},
): Scanner & { check(): Promise<void> } {
  const maxBytes = Math.min(options.maxBytes ?? MAX_FILE_BYTES, MAX_FILE_BYTES);
  const timeoutMs = options.timeoutMs ?? SCAN_TIMEOUT_MS;
  if (!Number.isInteger(maxBytes) || maxBytes < 1 || !Number.isInteger(timeoutMs) || timeoutMs < 1)
    throw unavailable();
  async function request(
    command: 'PING' | 'INSTREAM',
    stream?: ReadableStream<Uint8Array>,
  ): Promise<string> {
    const socket = createConnection({ host: config.host, port: config.port });
    socket.setNoDelay(true);
    const reader = stream?.getReader();
    let inputFinished = !stream;
    let reply = Buffer.alloc(0);
    let rejectReply: ((reason: unknown) => void) | undefined;
    const response = new Promise<string>((resolve, reject) => {
      rejectReply = reject;
      socket.on('error', () => reject(unavailable()));
      socket.on('end', () => reject(unavailable()));
      socket.on('close', () => reject(unavailable()));
      socket.on('data', (chunk: Buffer) => {
        if (reply.byteLength + chunk.byteLength > MAX_REPLY_BYTES) {
          reject(unavailable());
          return;
        }
        reply = Buffer.concat([reply, chunk]);
        const end = reply.indexOf(0);
        if (end < 0) return;
        if (
          !inputFinished ||
          end !== reply.byteLength - 1 ||
          reply.subarray(0, end).some((byte) => byte < 32 || byte > 126)
        ) {
          reject(unavailable());
          return;
        }
        resolve(reply.subarray(0, end).toString('ascii'));
      });
    });
    const timer = setTimeout(() => {
      rejectReply?.(unavailable());
      socket.destroy();
      void reader?.cancel().catch(() => {});
    }, timeoutMs);
    const write = (data: string | Uint8Array) =>
      new Promise<void>((resolve, reject) => {
        socket.write(data, (error) => (error ? reject(unavailable()) : resolve()));
      });
    const send = async () => {
      await write(`z${command}\0`);
      if (!reader) return;
      let total = 0;
      for (;;) {
        // oxlint-disable-next-line no-await-in-loop -- Pull one chunk at a time; socket writes apply backpressure.
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) throw unavailable();
        for (let offset = 0; offset < value.byteLength; offset += CHUNK_BYTES) {
          const chunk = value.subarray(offset, offset + CHUNK_BYTES);
          const length = Buffer.alloc(4);
          length.writeUInt32BE(chunk.byteLength);
          // oxlint-disable-next-line no-await-in-loop -- Each network-order length precedes its payload.
          await write(length);
          // oxlint-disable-next-line no-await-in-loop -- Bounded writes wait for the socket callback before pulling more.
          await write(chunk);
        }
      }
      inputFinished = true;
      await write(new Uint8Array(4));
    };
    try {
      const [, result] = await Promise.all([send(), response]);
      return result;
    } catch {
      throw unavailable();
    } finally {
      clearTimeout(timer);
      socket.destroy();
      void reader?.cancel().catch(() => {});
      reader?.releaseLock();
    }
  }
  return {
    async check() {
      if ((await request('PING')) !== 'PONG') throw unavailable();
    },
    async scan(stream) {
      const reply = await request('INSTREAM', stream);
      if (reply === 'stream: OK') return { status: 'clean' };
      const match = /^stream: ([A-Za-z0-9_.:()+/-]{1,200}) FOUND$/.exec(reply);
      if (match?.[1]) return { status: 'infected', signature: match[1] };
      throw unavailable();
    },
  };
}
