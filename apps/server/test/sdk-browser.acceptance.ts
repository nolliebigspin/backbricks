import { expect, test } from 'bun:test';

import { uploadIntentResponseSchema } from '@backbricks/module-uploads';
import type * as PublicSdk from '@backbricks/sdk';
import { chromium } from '@playwright/test';

import { garageTestSettings } from '../../../scripts/test/garage.ts';
import { scenario } from './auth-fixture.ts';
import { prepareUploads, uploadsEnvironment, uploadsAvailable } from './uploads-fixture.ts';
test.skipIf(!uploadsAvailable)(
  'Chromium uploads through native progress/CORS and aborts an in-flight PUT',
  async () => {
    await scenario(
      async (base) => {
        const f = await prepareUploads(base, { maxSizeMb: 5 });
        const tracked: Promise<void>[] = [];
        let closeBrowser: (() => Promise<void>) | undefined;
        let stopSite: (() => Promise<void>) | undefined;
        try {
          const bundle = await Bun.build({
            entrypoints: [Bun.resolveSync('@backbricks/sdk', import.meta.dir)],
            target: 'browser',
            format: 'esm',
          });
          if (!bundle.success || !bundle.outputs[0]) throw new Error('Browser bundle failed');
          const js = await bundle.outputs[0].text();
          const origin = garageTestSettings.corsOrigins.findLast((value) => value !== '*');
          if (!origin)
            throw new Error('Configure an allowed loopback HTTP origin for browser acceptance.');
          const source = new URL(origin);
          if (source.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(source.hostname))
            throw new Error('Browser acceptance needs an allowed loopback HTTP origin.');
          const site = Bun.serve({
            hostname: '127.0.0.1',
            port: Number(source.port) || 80,
            fetch(request) {
              return new URL(request.url).pathname === '/sdk.js'
                ? new Response(js, { headers: { 'content-type': 'text/javascript' } })
                : new Response('<!doctype html><title>SDK browser probe</title>', {
                    headers: { 'content-type': 'text/html' },
                  });
            },
          });
          stopSite = () => site.stop(true);
          const browser = await chromium.launch();
          closeBrowser = () => browser.close();
          const page = await browser.newPage();
          let puts = 0;
          let completes = 0;
          page.on('request', (request) => {
            if (request.method() === 'PUT') {
              puts++;
              expect(request.headers()['authorization']).toBeUndefined();
              expect(new URL(request.url()).searchParams.has('key')).toBe(false);
            }
            if (
              new URL(request.url()).pathname.endsWith('/complete') &&
              request.method() === 'POST'
            )
              completes++;
          });
          page.on('response', (response) => {
            if (
              new URL(response.url()).pathname.endsWith('/upload-zones/cv/files') &&
              response.ok()
            )
              tracked.push(
                response
                  .json()
                  .then((value) => f.trackIntent(uploadIntentResponseSchema.parse(value))),
              );
          });
          expect(
            (
              await f.request(
                `/v1/projects/${f.a1.id}`,
                { allowedOrigins: [origin] },
                f.owner.cookie,
                undefined,
                'PATCH',
              )
            ).status,
          ).toBe(200);
          await page.goto(origin);
          const result = await page.evaluate(
            async ({ baseUrl, key }) => {
              const path = '/sdk.js';
              const sdk: typeof PublicSdk = await import(path);
              const phases: string[] = [];
              const uploaded = await sdk
                .createClient({ baseUrl, publishableKey: key })
                .uploads.upload(
                  'cv',
                  new File(['%PDF-1.7\nBrowser\n%%EOF'], 'browser.pdf', {
                    type: 'application/pdf',
                  }),
                  { onProgress: (event) => phases.push(event.phase) },
                );
              return { fileId: uploaded.fileId, status: uploaded.status, phases };
            },
            { baseUrl: f.origin, key: f.publishable.token },
          );
          expect(result.status).toBe('ready');
          expect(result.phases).toContain('uploading');
          expect(result.phases.at(-1)).toBe('ready');
          expect(puts).toBe(1);
          expect(completes).toBeGreaterThan(0);
          const before = completes;
          const cdp = await page.context().newCDPSession(page);
          await cdp.send('Network.enable');
          await cdp.send('Network.emulateNetworkConditions', {
            offline: false,
            latency: 0,
            downloadThroughput: -1,
            uploadThroughput: 32768,
          });
          const aborted = await page.evaluate(
            async ({ baseUrl, key }) => {
              const path = '/sdk.js';
              const sdk: typeof PublicSdk = await import(path);
              const controller = new AbortController();
              let loaded = 0;
              try {
                await sdk.createClient({ baseUrl, publishableKey: key }).uploads.upload(
                  'cv',
                  new File(['%PDF-1.7\n', 'x'.repeat(2 * 1024 * 1024), '\n%%EOF'], 'cancel.pdf', {
                    type: 'application/pdf',
                  }),
                  {
                    signal: controller.signal,
                    timeoutMs: 15000,
                    onProgress: (event) => {
                      if (
                        event.phase === 'uploading' &&
                        event.loaded > 0 &&
                        event.loaded < event.total
                      ) {
                        loaded = event.loaded;
                        controller.abort();
                      }
                    },
                  },
                );
                return { name: 'unexpected', loaded };
              } catch (error) {
                return { name: error instanceof Error ? error.name : 'unknown', loaded };
              }
            },
            { baseUrl: f.origin, key: f.publishable.token },
          );
          expect(aborted.name).toBe('AbortError');
          expect(aborted.loaded).toBeGreaterThan(0);
          expect(puts).toBe(2);
          expect(completes).toBe(before);
        } finally {
          try {
            await closeBrowser?.();
            await Promise.all(tracked);
          } finally {
            await stopSite?.();
            await f.cleanup();
          }
        }
      },
      uploadsEnvironment,
      { durableDelivery: true },
    );
  },
  60000,
);
