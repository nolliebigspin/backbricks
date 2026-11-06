import { expect, test } from 'bun:test';

import { storageGetSchema, storageKeySchema } from '@backbricks/core';

import {
  garageAvailable,
  garageTestSettings as settings,
} from '../../../../scripts/test/garage.ts';
import { createS3Storage } from './s3.ts';

const available = await garageAvailable();
const config = {
  endpoint: settings.s3Endpoint,
  publicEndpoint: settings.s3Endpoint,
  region: settings.region,
  bucket: settings.bucket,
  accessKeyId: settings.accessKeyId,
  secretAccessKey: settings.secretAccessKey,
  forcePathStyle: true,
};

test.skipIf(!available)(
  'private S3 signs exact upload size/type, downloads safely and preserves copied objects',
  async () => {
    const storage = createS3Storage(config);
    const root = `test/${crypto.randomUUID()}`;
    const key = `${root}/staging`;
    const copy = `${root}/final`;
    try {
      await storage.check();
      const put = await storage.presignPut({
        key,
        size: 3,
        contentType: 'text/plain',
        expiresInSeconds: 60,
      });
      expect(new URL(put.url).searchParams.get('X-Amz-SignedHeaders')).toBe(
        'content-length;content-type;host',
      );
      for (const [body, type] of [
        ['abcd', 'text/plain'],
        ['ab', 'text/plain'],
        ['abc', 'text/html'],
      ]) {
        if (!body || !type) throw new Error('Expected upload test');
        // oxlint-disable-next-line no-await-in-loop -- Each rejection must precede the first valid upload.
        const response = await fetch(put.url, {
          method: 'PUT',
          headers: { 'content-type': type, 'content-length': String(body.length) },
          body,
        });
        expect(response.status).toBe(403);
      }
      expect(
        (await fetch(put.url, { method: 'PUT', headers: put.headers, body: 'abc' })).status,
      ).toBe(200);
      expect(await storage.head(key)).toEqual({ size: 3, contentType: 'text/plain' });
      await storage.copy(key, copy);
      expect(
        (await fetch(put.url, { method: 'PUT', headers: put.headers, body: 'xyz' })).status,
      ).toBe(200);
      expect(await new Response(await storage.read(copy)).text()).toBe('abc');
      const get = await storage.presignGet({
        key: copy,
        expiresInSeconds: 60,
        downloadName: 'Résumé.html',
      });
      const response = await fetch(get);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('application/octet-stream');
      expect(response.headers.get('content-disposition')).toContain('attachment;');
      expect(response.headers.get('content-disposition')).toContain('R%C3%A9sum%C3%A9.html');
      const unsigned = new URL(get);
      unsigned.search = '';
      expect((await fetch(unsigned)).status).toBe(403);
      const inline = await storage.presignGet({
        key: copy,
        expiresInSeconds: 60,
        inlineImageType: 'image/png',
      });
      expect((await fetch(inline)).headers.get('content-type')).toBe('image/png');
      const expired = createS3Storage(config, { now: () => new Date(Date.now() - 60_000) });
      try {
        const expiredResponse = await fetch(
          await expired.presignGet({ key: copy, expiresInSeconds: 1 }),
        );
        expect([400, 403]).toContain(expiredResponse.status);
        expect(await expiredResponse.text()).toMatch(/expired|date is too old/i);
      } finally {
        expired.close();
      }
      await storage.delete(copy);
      expect(await storage.head(copy)).toBeNull();
    } finally {
      await storage.delete(key);
      await storage.delete(copy);
      storage.close();
    }
  },
  20_000,
);

test.skipIf(!available)(
  'S3 internal I/O and browser signing endpoints are independent',
  async () => {
    const storage = createS3Storage({
      ...config,
      publicEndpoint: 'http://browser-storage.invalid:3900',
    });
    try {
      await storage.check();
      const signed = await storage.presignPut({
        key: `test/${crypto.randomUUID()}`,
        size: 1,
        contentType: 'text/plain',
        expiresInSeconds: 60,
      });
      expect(new URL(signed.url).host).toBe('browser-storage.invalid:3900');
    } finally {
      storage.close();
    }
  },
);

test('storage boundaries reject unsafe key, disposition, inline content and long TTL inputs', async () => {
  expect(storageKeySchema.safeParse('tenant/original.pdf').success).toBe(false);
  expect(storageKeySchema.safeParse('tenant/../escape').success).toBe(false);
  expect(storageGetSchema.safeParse({ key: 'opaque/key', expiresInSeconds: 301 }).success).toBe(
    false,
  );
  expect(
    storageGetSchema.safeParse({
      key: 'opaque/key',
      expiresInSeconds: 60,
      inlineImageType: 'image/svg+xml',
    }).success,
  ).toBe(false);
  expect(
    storageGetSchema.safeParse({
      key: 'opaque/key',
      expiresInSeconds: 60,
      downloadName: 'x\r\nInjected: header',
    }).success,
  ).toBe(false);
  const unavailable = createS3Storage({ ...config, endpoint: 'http://127.0.0.1:1' });
  try {
    expect(await unavailable.head('opaque/key').catch((error: unknown) => error)).toMatchObject({
      code: 'service_unavailable',
    });
  } finally {
    unavailable.close();
  }
});
