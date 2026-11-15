import { expect, test } from 'bun:test';
import { createServer } from 'node:http';

import { storageGetSchema, storageKeySchema } from '@backbricks/core';

import {
  garageAvailable,
  garageTestSettings as settings,
  garageStorageConfig,
} from '../../../../scripts/test/garage.ts';
import { storageProviderSettings } from '../../../../scripts/test/storage-provider.ts';
import { storageContract } from '../../test/storage-contract.ts';
import { createS3Storage } from './s3.ts';

const available = await garageAvailable();
const config = garageStorageConfig;

async function contract(input: Parameters<typeof createS3Storage>[0], origin: string) {
  const storage = createS3Storage(input);
  const expired = createS3Storage(input, { now: () => new Date(Date.now() - 60_000) });
  try {
    await storage.check();
    await storageContract(storage, expired, origin);
  } finally {
    storage.close();
    expired.close();
  }
}

test.skipIf(!available)(
  'Garage satisfies the private storage contract',
  () => contract(config, settings.corsOrigins[0] ?? 'http://localhost:5173'),
  30_000,
);
const provider = storageProviderSettings(process.env);
if (provider)
  test(
    'explicitly configured S3 provider satisfies the same storage contract',
    () => contract(provider.config, provider.origin),
    60_000,
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

test('S3 read-stream failures are sanitized after response headers without buffering private bytes', async () => {
  const server = createServer((_request, response) => {
    response.writeHead(200, {
      'content-type': 'application/octet-stream',
      'content-length': '100',
    });
    response.write('private-content');
    setTimeout(() => response.destroy(), 10);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected test listener.');
  const storage = createS3Storage({ ...config, endpoint: `http://127.0.0.1:${address.port}` });
  try {
    const failure = await new Response(await storage.read('test/opaque'))
      .arrayBuffer()
      .catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: 'service_unavailable' });
    expect(JSON.stringify(failure)).not.toContain('private-content');
  } finally {
    storage.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
