import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';

import type { APIRequestContext, Page } from '@playwright/test';
import { z } from 'zod';

import { receivedMail } from '../scripts/test/mailpit.ts';
import {
  createAccount,
  createOrganization,
  createProject,
  messages,
  type TestLanguage,
} from './accounts.ts';
import { expect, test, testHeaders } from './fixtures.ts';

/**
 * The M2 browser journeys run the files in `examples/html` (built: `dist/` holds the SDK bundle)
 * unchanged except for the two placeholders a website owner replaces, against the real server.
 */
const exampleDirectory = new URL('../examples/html/', import.meta.url);
const EXAMPLE_BASE_URL = 'http://localhost:5173/v1';
const PLACEHOLDER = 'YOUR_PUBLISHABLE_KEY';

type Example = { url: string; close: () => Promise<void> };

async function serveExample(publishableKey: string, apiBase: string): Promise<Example> {
  const server: Server = createServer((request, response) => {
    void (async () => {
      const path = new URL(request.url ?? '/', 'http://site').pathname;
      try {
        const name = path === '/' ? 'index.html' : path.slice(1);
        if (!/^(dist\/)?[a-z-]+\.(html|js)$/.test(name)) throw new Error('not found');
        const text = (await readFile(new URL(name, exampleDirectory), 'utf8'))
          .replaceAll(PLACEHOLDER, publishableKey)
          .replaceAll(EXAMPLE_BASE_URL, apiBase);
        response.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : 'text/html');
        response.end(text);
      } catch {
        response.statusCode = 404;
        response.end();
      }
    })();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a local address');
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
  };
}

const exampleFields = async () =>
  z
    .object({ fields: z.array(z.unknown()) })
    .parse(JSON.parse(await readFile(new URL('form.json', exampleDirectory), 'utf8')));
const tokenSchema = z.object({ token: z.string() });
const idSchema = z.object({ id: z.string() });
const summarySchema = z.object({ total: z.number() });
const optionsSchema = z.object({
  recipients: z.array(z.object({ id: z.string(), email: z.string() })),
});

/** Owner, organization, project, publishable key and the example site as an allowed origin. */
async function setUp(page: Page, baseURL: string, language: TestLanguage) {
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
  const key = await page.request.post(`${project}/keys`, {
    headers,
    data: { kind: 'publishable', name: 'Example website', expiresAt: null },
  });
  expect(key.status()).toBe(201);
  const { token } = tokenSchema.parse(await key.json());
  const site = await serveExample(token, `${baseURL}/v1`);
  expect(
    (await page.request.patch(project, { headers, data: { allowedOrigins: [site.url] } })).status(),
  ).toBe(200);
  const createForm = async (formKey: string, settings: Record<string, unknown>) => {
    const response = await page.request.post(`${project}/forms`, {
      headers,
      data: {
        key: formKey,
        name: `Contact ${formKey}`,
        config: { ...(await exampleFields()), ...settings },
      },
    });
    expect(response.status(), await response.text()).toBe(201);
    return idSchema.parse(await response.json()).id;
  };
  return { email, projectId, project, headers, site, createForm, request: page.request };
}

async function entryCount(
  request: APIRequestContext,
  project: string,
  form: string,
  headers: Record<string, string>,
) {
  const response = await request.get(`${project}/forms/${form}/summary`, { headers });
  expect(response.status()).toBe(200);
  return summarySchema.parse(await response.json()).total;
}

test('the plain HTML example works without JavaScript; honeypot and errors are handled (de dashboard)', async ({
  browser,
  baseURL,
}) => {
  const owner = await browser.newContext({ locale: 'de-DE', extraHTTPHeaders: testHeaders() });
  const page = await owner.newPage();
  const copy = messages('de');
  const setup = await setUp(page, baseURL!, 'de');
  const visitor = await browser.newContext({
    javaScriptEnabled: false,
    extraHTTPHeaders: testHeaders(),
  });
  try {
    await setup.createForm('contact-plain', {
      spam: { proofOfWork: false },
      redirects: { success: `${setup.site.url}/thanks.html` },
    });
    const site = await visitor.newPage();

    // A visitor submits the real form; the browser follows the redirect to the thank-you page.
    await site.goto(setup.site.url);
    await site.getByLabel('Name', { exact: true }).fill('Grace Hopper');
    await site.getByLabel('Email', { exact: true }).fill('grace@example.com');
    await site.getByLabel('Message', { exact: true }).fill('No JavaScript needed');
    await site.getByRole('checkbox').check();
    await site.getByRole('button', { name: 'Send' }).click();
    await expect(site).toHaveURL(`${setup.site.url}/thanks.html`);
    await expect(site.getByRole('heading', { name: 'Thank you' })).toBeVisible();

    // Server-side validation: an address browsers accept but the server rejects.
    await site.goto(setup.site.url);
    await site.getByLabel('Name', { exact: true }).fill('Grace Hopper');
    await site.getByLabel('Email', { exact: true }).fill('grace@localhost');
    await site.getByLabel('Message', { exact: true }).fill('Checked on the server');
    await site.getByRole('checkbox').check();
    await site.getByRole('button', { name: 'Send' }).click();
    await expect(site.getByRole('listitem')).toHaveText('email: invalid_email');

    // A bot fills the hidden honeypot: it looks accepted, but nothing is stored.
    const action = await site
      .goto(setup.site.url)
      .then(() => site.locator('form').getAttribute('action'));
    const trapped = await visitor.request.post(action!, {
      headers: { origin: setup.site.url },
      form: {
        name: 'Bot',
        email: 'bot@example.com',
        message: 'Buy now',
        privacy: 'on',
        _gotcha: 'x',
      },
      maxRedirects: 0,
    });
    expect(trapped.status()).toBe(303);
    expect(await entryCount(setup.request, setup.project, 'contact-plain', setup.headers)).toBe(1);

    // The owner sees the entry in the German dashboard.
    await page.goto(`/projects/${setup.projectId}/forms/contact-plain`);
    await expect(page.getByRole('tab', { name: copy.forms.tabs.entries })).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: 'Grace Hopper' })).toBeVisible();
  } finally {
    await visitor.close();
    await setup.site.close();
    await owner.close();
  }
});

test('the SDK example solves proof-of-work, shows errors, notifies without content and exports safe CSV', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(240_000);
  const copy = messages('en');
  const owner = await browser.newContext({ locale: 'en-US', extraHTTPHeaders: testHeaders() });
  const page = await owner.newPage();
  const setup = await setUp(page, baseURL!, 'en');
  // Playwright adds the configured synthetic forwarding header to every context; page scripts
  // would send it cross-origin and fail the CORS preflight, so this visitor sends none.
  const visitor = await browser.newContext({ extraHTTPHeaders: {} });
  try {
    const formId = await setup.createForm('contact', {});
    const options = await setup.request.get(`${setup.project}/notification-rules/options`, {
      headers: setup.headers,
    });
    const { recipients } = optionsSchema.parse(await options.json());
    const recipient = recipients.find((entry) => entry.email === setup.email);
    expect(
      (
        await setup.request.post(`${setup.project}/notification-rules`, {
          headers: setup.headers,
          data: {
            eventType: 'forms.submission.created',
            instanceId: formId,
            recipientUserIds: [recipient!.id],
          },
        })
      ).status(),
    ).toBe(201);
    const site = await visitor.newPage();
    await site.goto(`${setup.site.url}/sdk.html`);

    // Validation errors from the server appear next to the form.
    await site.getByLabel('Name', { exact: true }).fill('=SUM(1)');
    await site.getByLabel('Email', { exact: true }).fill('ada@localhost');
    await site.getByLabel('Message', { exact: true }).fill('Private message text');
    await site.getByRole('checkbox').check();
    await site.getByRole('button', { name: 'Send' }).click();
    await expect(site.locator('output')).toContainText('email:');
    expect(await entryCount(setup.request, setup.project, 'contact', setup.headers)).toBe(0);

    // Corrected, the SDK solves a fresh proof and the entry is stored.
    await site.getByLabel('Email', { exact: true }).fill('ada@example.com');
    await site.getByRole('button', { name: 'Send' }).click();
    await expect(site.locator('output')).toHaveText('Thank you! Your message was sent.');

    // Entry visible in the dashboard; the CSV export defuses the formula.
    await page.goto(`/projects/${setup.projectId}/forms/contact`);
    await expect(page.getByRole('row').filter({ hasText: '=SUM(1)' })).toBeVisible();
    const download = page.waitForEvent('download');
    await page.getByRole('link', { name: copy.forms.entries.download }).click();
    const csv = await readFile(await (await download).path(), 'utf8');
    expect(csv).toContain("'=SUM(1)");
    expect(csv).not.toMatch(/(^|,)=SUM/m);

    // The owner's notification names the form but carries none of the entry's content. The
    // outbox is dispatched by a once-a-minute schedule, so delivery can take up to two minutes.
    await expect
      .poll(
        async () =>
          (await receivedMail(setup.email, 0, 'New entry').catch(() => null))?.Subject ?? '',
        { timeout: 150_000 },
      )
      .toContain('New entry: Contact contact');
    const mail = await receivedMail(setup.email, 0, 'New entry');
    expect(`${mail.Text}${mail.HTML}`).not.toContain('Private message text');
    expect(`${mail.Text}${mail.HTML}`).not.toContain('ada@example.com');
  } finally {
    await visitor.close();
    await setup.site.close();
    await owner.close();
  }
});
