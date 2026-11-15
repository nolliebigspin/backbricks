import { expect } from 'bun:test';

import type { StorageAdapter } from '@backbricks/core';

import { startSlowPut } from '../../../scripts/test/slow-put.ts';

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
    expiresInSeconds: 2,
  });
  const control = { key, handle: session.handle };
  const put = startSlowPut(session.url, session.headers, 'a');
  try {
    await put.started;
    await Bun.sleep(150);
    await storage.abortUpload(control);
    await Bun.sleep(2100);
    put.finish('b');
    await put.response;
    await storage.abortUpload(control);
    expect(await storage.head(key)).toBeNull();
    expect(
      await storage.completeUpload({ ...control, size: 2 }).catch((error: unknown) => error),
    ).toMatchObject({ code: 'service_unavailable' });
    expect(
      (await fetch(session.url, { method: 'PUT', headers: session.headers, body: 'ab' })).ok,
    ).toBe(false);
  } finally {
    put.close();
    await put.response;
    await storage.abortUpload(control);
    await storage.delete(key);
  }
}

/** Control proves an accepted part body really can finish after signature expiry. */
export async function inflightSessionControl(storage: StorageAdapter) {
  const key = `test/${crypto.randomUUID()}/inflight_control`;
  const session = await storage.createUploadSession({
    key,
    size: 2,
    contentType: 'text/plain',
    expiresInSeconds: 2,
  });
  const put = startSlowPut(session.url, session.headers, 'a');
  try {
    await put.started;
    await Bun.sleep(2100);
    put.finish('b');
    expect(await put.response).toBe(200);
    expect(await storage.head(key)).toBeNull();
    await storage.completeUpload({ key, handle: session.handle, size: 2 });
    expect(await new Response(await storage.read(key)).text()).toBe('ab');
  } finally {
    put.close();
    await put.response;
    await storage.abortUpload({ key, handle: session.handle });
    await storage.delete(key);
  }
}
