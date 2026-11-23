import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';

import type { Page } from '@playwright/test';
import { z } from 'zod';

import { createAccount, createOrganization, createProject, type TestLanguage } from './accounts.ts';
import { expect } from './fixtures.ts';

export const EXAMPLE_BASE_URL = 'http://localhost:5173/v1';
const exampleDirectory = new URL('../examples/html/', import.meta.url);
/** Serve the committed example with only its key/API placeholders filled. */
export async function serveExample(publishableKey: string, apiBase: string, origin?: string) {
  const source = origin ? new URL(origin) : undefined;
  if (
    source &&
    (source.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(source.hostname))
  )
    throw new Error('Examples need an allowed loopback HTTP origin.');
  const server = createServer((request, response) => {
    void (async () => {
      const path = new URL(request.url ?? '/', 'http://site').pathname;
      try {
        const name = path === '/' ? 'index.html' : path.slice(1);
        if (!/^(dist\/)?[a-z-]+\.(html|js)$/.test(name)) throw new Error('Not found');
        const text = (await readFile(new URL(name, exampleDirectory), 'utf8'))
          .replaceAll('YOUR_PUBLISHABLE_KEY', publishableKey)
          .replaceAll(EXAMPLE_BASE_URL, apiBase);
        response.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : 'text/html');
        response.end(text);
      } catch {
        response.statusCode = 404;
        response.end();
      }
    })();
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(source ? Number(source.port) || 80 : 0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a local address.');
  return {
    url: source?.origin ?? `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}
/** Real owner, publishable credential and project origin used by both example journeys. */
export async function setUpExample(
  page: Page,
  baseURL: string,
  language: TestLanguage,
  siteOrigin?: string,
) {
  const project = await provisionExample(page, baseURL, language);
  const site = await serveExample(project.publishableKey, `${baseURL}/v1`, siteOrigin);
  try {
    await allowExampleOrigin(project, site.url);
  } catch (error) {
    await site.close();
    throw error;
  }
  return { ...project, site };
}

export async function provisionExample(page: Page, baseURL: string, language: TestLanguage) {
  const email = await createAccount(page, language);
  const organizationId = await createOrganization(
    page,
    'Example organization',
    undefined,
    language,
  );
  const projectId = await createProject(page, 'Example website', language);
  const headers = {
    origin: baseURL,
    'x-backbricks-csrf': '1',
    'x-backbricks-organization-id': organizationId,
  };
  const project = `/v1/projects/${projectId}`;
  const response = await page.request.post(`${project}/keys`, {
    headers,
    data: { kind: 'publishable', name: 'Example website', expiresAt: null },
  });
  expect(response.status()).toBe(201);
  const { token } = z.object({ token: z.string() }).parse(await response.json());
  return {
    email,
    organizationId,
    projectId,
    project,
    headers,
    publishableKey: token,
    request: page.request,
  };
}

export async function allowExampleOrigin(
  { project, headers, request }: Awaited<ReturnType<typeof provisionExample>>,
  origin: string,
) {
  expect(
    (await request.patch(project, { headers, data: { allowedOrigins: [origin] } })).status(),
  ).toBe(200);
}
