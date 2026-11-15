import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';

import { createS3Storage } from '@backbricks/adapters';

import {
  garageAvailable,
  garageStorageConfig,
  garageTestSettings,
} from '../scripts/test/garage.ts';
import { expect, test } from './fixtures.ts';

test('a real browser PUT satisfies signed length/type and CORS; a late PUT cannot alter the copy', async ({
  page,
}) => {
  expect(await garageAvailable()).toBe(true);
  const storage = createS3Storage(garageStorageConfig);
  const root = `test/${randomUUID()}`;
  const staging = `${root}/staging`;
  const final = `${root}/final`;
  const origin =
    garageTestSettings.corsOrigins.find((value) => value !== '*') ?? 'http://localhost:5173';
  const site = `${origin}/storage-contract`;
  let fixture: Server | undefined;
  try {
    const source = new URL(origin);
    if (source.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(source.hostname))
      throw new Error('The browser storage contract needs an allowed local HTTP origin.');
    const running = await fetch(origin, {
      signal: AbortSignal.timeout(1000),
      redirect: 'manual',
    }).then(
      () => true,
      () => false,
    );
    if (!running) {
      const server = createServer((_request, response) => {
        response.setHeader('Content-Type', 'text/html');
        response.end('<!doctype html><title>Storage contract fixture</title>');
      });
      fixture = server;
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(Number(source.port) || 80, '127.0.0.1', resolve);
      });
    }
    await page.goto(site);
    expect(new URL(page.url()).origin).toBe(origin);
    await page.setContent('<!doctype html><title>Storage contract fixture</title>');
    const put = await storage.presignPut({
      key: staging,
      size: 3,
      contentType: 'text/plain',
      expiresInSeconds: 300,
    });
    const upload = (contents: string) =>
      page.evaluate(
        async ({ url, body }) => {
          const file = new File([body], 'fixture.txt', { type: 'text/plain' });
          // The browser computes Content-Length; trying to set that forbidden header is incorrect.
          const response = await fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': file.type },
            body: file,
          });
          return response.status;
        },
        { url: put.url, body: contents },
      );
    expect(await upload('abc')).toBe(200);
    expect(await storage.head(staging)).toEqual({ size: 3, contentType: 'text/plain' });
    await storage.copy(staging, final);
    expect(await upload('xyz')).toBe(200);
    const download = await storage.presignGet({
      key: final,
      expiresInSeconds: 60,
      downloadName: 'fixture.txt',
    });
    expect(await page.evaluate(async (url) => (await fetch(url)).text(), download)).toBe('abc');
    expect((await fetch(download)).headers.get('content-disposition')).toContain('attachment;');
  } finally {
    await Promise.all([storage.delete(staging), storage.delete(final)]);
    storage.close();
    if (fixture) {
      const server = fixture;
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      });
    }
  }
});
