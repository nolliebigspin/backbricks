import { expect } from 'bun:test';
import { request } from 'node:http';

import type { StorageAdapter } from '@backbricks/core';

/** A public PUT can write a part, but cannot create or recreate a private object. */
export async function storageSessionContract(storage: StorageAdapter) {
  const key = `test/${crypto.randomUUID()}/session`;
  const session = await storage.createUploadSession({
    key,
    size: 3,
    contentType: 'text/plain',
    expiresInSeconds: 300,
  });
  const control = { key, handle: session.handle };
  try {
    expect(new URL(session.url).searchParams.get('X-Amz-SignedHeaders')).toBe(
      'content-length;content-type;host',
    );
    for (const [body, type] of [
      ['abcd', 'text/plain'],
      ['ab', 'text/plain'],
      ['abc', 'text/html'],
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop -- Rejected writes are verified independently.
      const response = await fetch(session.url, {
        method: 'PUT',
        headers: { 'content-type': type, 'content-length': String(body.length) },
        body,
      });
      expect(response.ok).toBe(false);
    }
    expect(
      (await fetch(session.url, { method: 'PUT', headers: session.headers, body: 'abc' })).ok,
    ).toBe(true);
    expect(await storage.head(key)).toBeNull();
    expect(
      await storage.completeUpload({ ...control, size: 4 }).catch((error: unknown) => error),
    ).toMatchObject({ code: 'validation_failed' });
    await storage.completeUpload({ ...control, size: 3 });
    expect(await storage.head(key)).toEqual({ size: 3, contentType: 'text/plain' });
    expect(await new Response(await storage.read(key)).text()).toBe('abc');
    expect(
      (await fetch(session.url, { method: 'PUT', headers: session.headers, body: 'xyz' })).ok,
    ).toBe(false);
    await storage.abortUpload(control);
    expect(await new Response(await storage.read(key)).text()).toBe('abc');
  } finally {
    await storage.abortUpload(control);
    await storage.delete(key);
  }
}

/** Starts a real body before abort, then finishes it after the signature's expiry. */
export async function abortedInflightSessionContract(storage: StorageAdapter) {
  const key = `test/${crypto.randomUUID()}/inflight`;
  const session = await storage.createUploadSession({
    key,
    size: 2,
    contentType: 'text/plain',
    expiresInSeconds: 1,
  });
  const control = { key, handle: session.handle };
  let finish: (() => void) | undefined;
  const response = new Promise<number>((resolve, reject) => {
    const req = request(session.url, { method: 'PUT', headers: session.headers }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode ?? 0));
    });
    req.on('error', reject);
    req.write('a');
    finish = () => req.end('b');
  });
  try {
    await Bun.sleep(150);
    await storage.abortUpload(control);
    await Bun.sleep(1100);
    finish?.();
    await response;
    await storage.abortUpload(control);
    expect(await storage.head(key)).toBeNull();
    expect(
      await storage.completeUpload({ ...control, size: 2 }).catch((error: unknown) => error),
    ).toMatchObject({ code: 'service_unavailable' });
    expect(
      (await fetch(session.url, { method: 'PUT', headers: session.headers, body: 'ab' })).ok,
    ).toBe(false);
  } finally {
    finish?.();
    await response.catch(() => undefined);
    await storage.abortUpload(control);
    await storage.delete(key);
  }
}
