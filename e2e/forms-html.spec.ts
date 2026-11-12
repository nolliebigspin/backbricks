import { createAccount, createOrganization, createProject } from './accounts.ts';
import { expect, test, testHeaders } from './fixtures.ts';

test('a plain HTML form submits with JavaScript disabled and reaches its success page', async ({
  page,
  browser,
  baseURL,
}) => {
  await createAccount(page);
  const organizationId = await createOrganization(page, 'HTML forms organization');
  const projectId = await createProject(page, 'HTML forms website');
  const headers = {
    origin: baseURL!,
    'x-backbricks-csrf': '1',
    'x-backbricks-organization-id': organizationId,
  };
  const project = `/v1/projects/${projectId}`;
  const key = await page.request.post(`${project}/keys`, {
    headers,
    data: { kind: 'publishable', name: 'HTML website', expiresAt: null },
  });
  expect(key.status()).toBe(201);
  const { token } = await key.json();
  const action = `${baseURL}/v1/public/forms/html/submissions?key=${token}`;
  const website = createServer((request, response) => {
    response.setHeader('Content-Type', 'text/html');
    response.end(
      request.url === '/thanks'
        ? '<h1>Thank you</h1>'
        : `<form method="post" action="${action}"><label>Name<input name="name" required></label><button>Send</button></form>`,
    );
  });
  await new Promise<void>((resolve) => website.listen(0, '127.0.0.1', resolve));
  const address = website.address();
  if (!address || typeof address === 'string') throw new Error('Expected local fixture address');
  const siteURL = `http://127.0.0.1:${address.port}`;
  const context = await browser.newContext({
    javaScriptEnabled: false,
    extraHTTPHeaders: testHeaders(),
  });
  try {
    expect(
      (
        await page.request.patch(project, { headers, data: { allowedOrigins: [siteURL] } })
      ).status(),
    ).toBe(200);
    expect(
      (
        await page.request.post(`${project}/forms`, {
          headers,
          data: {
            key: 'html',
            name: 'HTML contact',
            config: {
              fields: [{ key: 'name', type: 'text', label: 'Name', required: true }],
              spam: { proofOfWork: false },
              redirects: { success: `${siteURL}/thanks` },
            },
          },
        })
      ).status(),
    ).toBe(201);
    const visitor = await context.newPage();
    await visitor.goto(siteURL);
    await visitor.getByLabel('Name').fill('Ada');
    const submitted = visitor.waitForResponse(
      (response) => response.url() === action && response.request().method() === 'POST',
    );
    await visitor.getByRole('button', { name: 'Send' }).click();
    expect((await submitted).status()).toBe(303);
    await expect(visitor).toHaveURL(`${siteURL}/thanks`);
    await expect(visitor.getByRole('heading', { name: 'Thank you' })).toBeVisible();
    const usage = await page.request.get(`${project}/usage`);
    expect(usage.status()).toBe(200);
    expect(await usage.text()).toContain('forms.submissions');
  } finally {
    await context.close();
    await new Promise<void>((resolve, reject) =>
      website.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
import { createServer } from 'node:http';
