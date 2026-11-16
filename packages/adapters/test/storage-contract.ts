import { expect } from 'bun:test';

import type { StorageAdapter } from '@backbricks/core';

/** Backend-neutral assertions. Only the two unique fixture keys created here are ever deleted. */
export async function storageContract(
  storage: StorageAdapter,
  expired: StorageAdapter,
  origin: string,
) {
  const root = `test/${crypto.randomUUID()}`;
  const key = `${root}/staging`;
  const copy = `${root}/final`;
  try {
    const put = await storage.presignPut({
      key,
      size: 3,
      contentType: 'text/plain',
      expiresInSeconds: 300,
    });
    expect(new URL(put.url).searchParams.get('X-Amz-SignedHeaders')).toBe(
      'content-length;content-type;host',
    );
    expect(new URL(put.url).searchParams.get('X-Amz-Expires')).toBe('300');
    const preflight = await fetch(put.url, {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'PUT',
        'Access-Control-Request-Headers': 'content-type',
      },
    });
    expect(preflight.ok).toBe(true);
    expect([origin, '*']).toContain(preflight.headers.get('access-control-allow-origin') ?? '');
    expect(preflight.headers.get('access-control-allow-methods')).toContain('PUT');
    for (const [body, type] of [
      ['abcd', 'text/plain'],
      ['ab', 'text/plain'],
      ['abc', 'text/html'],
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop -- Each rejection must leave the key absent before the next case.
      const response = await fetch(put.url, {
        method: 'PUT',
        headers: { 'content-type': type, 'content-length': String(body.length) },
        body,
      });
      expect(response.ok).toBe(false);
      // oxlint-disable-next-line no-await-in-loop -- Verify the rejected PUT did not persist bytes.
      expect(await storage.head(key)).toBeNull();
    }
    expect((await fetch(put.url, { method: 'PUT', headers: put.headers, body: 'abc' })).ok).toBe(
      true,
    );
    expect(await storage.head(key)).toEqual({ size: 3, contentType: 'text/plain' });
    await storage.copy(key, copy);
    expect((await fetch(put.url, { method: 'PUT', headers: put.headers, body: 'xyz' })).ok).toBe(
      true,
    );
    expect(await new Response(await storage.read(copy)).text()).toBe('abc');
    const get = await storage.presignGet({
      key: copy,
      expiresInSeconds: 60,
      downloadName: 'Résumé.html',
    });
    const response = await fetch(get);
    expect(response.ok).toBe(true);
    expect(response.headers.get('content-type')).toBe('application/octet-stream');
    expect(response.headers.get('content-disposition')).toContain('attachment;');
    expect(response.headers.get('content-disposition')).toContain('R%C3%A9sum%C3%A9.html');
    const unsigned = new URL(get);
    unsigned.search = '';
    expect((await fetch(unsigned)).ok).toBe(false);
    const inline = await storage.presignGet({
      key: copy,
      expiresInSeconds: 60,
      inlineImageType: 'image/png',
    });
    expect((await fetch(inline)).headers.get('content-type')).toBe('image/png');
    const old = await fetch(await expired.presignGet({ key: copy, expiresInSeconds: 1 }));
    expect([400, 403]).toContain(old.status);
    expect(await old.text()).toMatch(/expired|date is too old/i);
    await storage.delete(copy);
    expect(await storage.head(copy)).toBeNull();
  } finally {
    await Promise.all([storage.delete(key), storage.delete(copy)]);
  }
}
