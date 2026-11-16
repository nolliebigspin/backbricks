import { expect, test } from 'bun:test';
import { createServer, type Socket } from 'node:net';

import { createClamavScanner } from './clamav.ts';

function bytes(value = 'clean') {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(value));
      controller.close();
    },
  });
}
async function peer(run: (socket: Socket) => void, testPeer: (port: number) => Promise<void>) {
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on('error', () => {});
    socket.on('close', () => sockets.delete(socket));
    run(socket);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP fixture');
  try {
    await testPeer(address.port);
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
/** Incremental peer parser verifies byte order, max chunk size and terminator without retaining the file. */
function protocol(socket: Socket, result: string, observe: (total: number) => void = () => {}) {
  let pending = Buffer.alloc(0);
  let command = false;
  let expected: number | null = null;
  let total = 0;
  socket.on('data', (data: Buffer) => {
    pending = Buffer.concat([pending, data]);
    if (!command) {
      const end = pending.indexOf(0);
      if (end < 0) return;
      const name = pending.subarray(0, end).toString();
      if (name === 'zPING') {
        socket.end('PONG\0');
        return;
      }
      expect(name).toBe('zINSTREAM');
      pending = pending.subarray(end + 1);
      command = true;
    }
    for (;;) {
      if (expected === null) {
        if (pending.length < 4) return;
        expected = pending.readUInt32BE(0);
        expect(expected).toBeLessThanOrEqual(64 * 1024);
        pending = pending.subarray(4);
        if (expected === 0) {
          observe(total);
          socket.end(result);
          return;
        }
      }
      if (pending.length < expected) return;
      total += expected;
      pending = pending.subarray(expected);
      expected = null;
    }
  });
}
const config = (port: number) => ({ kind: 'clamav' as const, host: '127.0.0.1', port });

test('ClamAV streams bounded network-order chunks, checks PING and parses clean/infected verdicts', async () => {
  let received = 0;
  await peer(
    (socket) =>
      protocol(socket, 'stream: OK\0', (total) => {
        received = total;
      }),
    async (port) => {
      const scanner = createClamavScanner(config(port));
      await scanner.check();
      let remaining = 4 * 1024 * 1024;
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (remaining === 0) {
            controller.close();
            return;
          }
          const size = Math.min(remaining, 200_000);
          remaining -= size;
          controller.enqueue(new Uint8Array(size));
        },
      });
      expect(await scanner.scan(stream)).toEqual({ status: 'clean' });
      expect(received).toBe(4 * 1024 * 1024);
    },
  );
  await peer(
    (socket) => protocol(socket, 'stream: Win.Test.EICAR_HDB-1 FOUND\0'),
    async (port) => {
      expect(await createClamavScanner(config(port)).scan(bytes())).toEqual({
        status: 'infected',
        signature: 'Win.Test.EICAR_HDB-1',
      });
    },
  );
});

test('ClamAV rejects malformed, truncated, oversized, premature and disconnected replies without private diagnostics', async () => {
  for (const reply of [
    'stream: secret-content ERROR\0',
    'stream: OK',
    'stream: OK\0junk',
    `stream: ${'x'.repeat(2000)} FOUND\0`,
    'stream: bad signature FOUND\0',
  ]) {
    // oxlint-disable-next-line no-await-in-loop -- Independent malformed peer cases each own an ephemeral socket.
    await peer(
      (socket) => protocol(socket, reply),
      async (port) => {
        const error = await createClamavScanner(config(port))
          .scan(bytes('secret-content'))
          .catch((failure: unknown) => failure);
        expect(error).toMatchObject({ code: 'service_unavailable' });
        expect(JSON.stringify(error)).not.toContain('secret-content');
      },
    );
  }
  await peer(
    (socket) => socket.end('stream: OK\0'),
    async (port) => {
      expect(
        await createClamavScanner(config(port))
          .scan(new ReadableStream<Uint8Array>({ pull: () => new Promise<void>(() => {}) }))
          .catch((error: unknown) => error),
      ).toMatchObject({ code: 'service_unavailable' });
    },
  );
  await peer(
    (socket) => socket.destroy(),
    async (port) => {
      expect(
        await createClamavScanner(config(port))
          .scan(bytes())
          .catch((error: unknown) => error),
      ).toMatchObject({ code: 'service_unavailable' });
    },
  );
});

test('ClamAV bounds outgoing bytes and cancels stalled or failed input on timeout', async () => {
  await peer(
    (socket) => protocol(socket, 'stream: OK\0'),
    async (port) => {
      expect(
        await createClamavScanner(config(port), { maxBytes: 2 })
          .scan(bytes('too long'))
          .catch((error: unknown) => error),
      ).toMatchObject({ code: 'service_unavailable' });
      expect(
        await createClamavScanner(config(port))
          .scan(
            new ReadableStream({
              start(controller) {
                controller.error(new Error('private input failure'));
              },
            }),
          )
          .catch((error: unknown) => error),
      ).toMatchObject({ code: 'service_unavailable' });
    },
  );
  let cancelled = false;
  await peer(
    () => {},
    async (port) => {
      const stream = new ReadableStream<Uint8Array>({
        pull: () => new Promise<void>(() => {}),
        cancel() {
          cancelled = true;
        },
      });
      const start = performance.now();
      expect(
        await createClamavScanner(config(port), { timeoutMs: 50 })
          .scan(stream)
          .catch((error: unknown) => error),
      ).toMatchObject({ code: 'service_unavailable' });
      expect(performance.now() - start).toBeLessThan(1000);
      expect(cancelled).toBe(true);
    },
  );
});
