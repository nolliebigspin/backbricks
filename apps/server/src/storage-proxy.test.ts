// SPDX-License-Identifier: AGPL-3.0-only

import { expect, test } from 'bun:test';

import { createS3Storage } from '@backbricks/adapters';

import { createStorageProxy } from './storage-proxy.ts';

test('proxy tickets enforce method, expiry and attachment independently of provider headers', async () => {
  let reads = 0;
  const provider = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch() {
      reads++;
      return new Response('fixture bytes', { headers: { 'content-type': 'text/html' } });
    },
  });
  let time = Date.parse('2026-11-24T00:00:00Z');
  const clock = { now: () => new Date(time) };
  const storage = createS3Storage(
    {
      endpoint: provider.url.origin,
      region: 'example',
      bucket: 'fixture',
      accessKeyId: 'fixture',
      secretAccessKey: 'fixture',
      forcePathStyle: true,
    },
    clock,
  );
  try {
    const proxy = createStorageProxy(
      'https://app.example.invalid',
      provider.url.origin,
      'test-secret',
      clock,
    );
    const signed = await proxy.wrap(storage).presignGet({
      key: 'file/synthetic',
      expiresInSeconds: 2,
      downloadName: 'example.pdf',
    });
    expect(signed).not.toContain(provider.url.origin);
    expect((await proxy.handle(new Request(signed, { method: 'PUT' }))).status).toBe(404);
    const response = await proxy.handle(new Request(signed));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/octet-stream');
    expect(response.headers.get('content-disposition')).toMatch(/^attachment;.*example\.pdf/);
    expect(await response.text()).toBe('fixture bytes');
    time += 2001;
    expect((await proxy.handle(new Request(signed))).status).toBe(404);
    expect(reads).toBe(1);
  } finally {
    storage.close();
    await provider.stop(true);
  }
});
