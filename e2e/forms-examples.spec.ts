import { readFile } from 'node:fs/promises';

import type { APIRequestContext, Page } from '@playwright/test';
import { z } from 'zod';

import { receivedMail } from '../scripts/test/mailpit.ts';
import { messages, type TestLanguage } from './accounts.ts';
import { setUpExample } from './example-site.ts';
import { expect, test, testHeaders } from './fixtures.ts';

/**
 * The M2 browser journeys run the files in `examples/html` (built: `dist/` holds the SDK bundle)
 * unchanged except for the two placeholders a website owner replaces, against the real server.
 */
const exampleDirectory = new URL('../examples/html/', import.meta.url);
const exampleFields = async () =>
  z
    .object({ fields: z.array(z.unknown()) })
    .parse(JSON.parse(await readFile(new URL('form.json', exampleDirectory), 'utf8')));
const idSchema = z.object({ id: z.string() });
const summarySchema = z.object({ total: z.number() });
const optionsSchema = z.object({
  recipients: z.array(z.object({ id: z.string(), email: z.string() })),
});

/** Owner, organization, project, publishable key and the example site as an allowed origin. */
async function setUp(page: Page, baseURL: string, language: TestLanguage) {
  const setup = await setUpExample(page, baseURL, language);
  const { headers, project } = setup;
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
  return { ...setup, createForm };
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
