import { createAccount, createOrganization, createProject, messages } from './accounts.ts';
import { expect, test, testHeaders } from './fixtures.ts';

test.use({ trace: 'off' });

test('secret reveal is ephemeral, clipboard denial is safe and revocation is enforced', async ({
  page,
  request,
}) => {
  await createAccount(page);
  await createOrganization(page, 'Key organization');
  const projectId = await createProject(page, 'Key website');
  await page.getByRole('link', { name: 'Embed', exact: true }).click();
  await page.locator('summary').filter({ hasText: 'Create key' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Private agent');
  await page.getByLabel('Key type').selectOption('secret');
  await expect(
    page.getByText('No personal records, deletion, or key management.', { exact: false }),
  ).toBeVisible();
  await page.getByLabel('No expiration', { exact: true }).check();
  await page.getByRole('button', { name: 'Create key', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const token = await dialog.getByLabel('Save your new key').inputValue();
  expect(token.length).toBeGreaterThan(30);
  const allowed = await request.get(`/v1/projects/${projectId}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  expect(allowed.status()).toBe(200);
  await page.evaluate(
    'Object.defineProperty(navigator, "clipboard", {value: {writeText: async () => {throw new Error("blocked");}}, configurable: true})',
  );
  await dialog.getByRole('button', { name: 'Copy key' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Copying was blocked');
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(await page.locator('body').textContent()).not.toContain(token);
  expect(
    await page.evaluate('JSON.stringify({local: {...localStorage}, session: {...sessionStorage}})'),
  ).not.toContain(token);
  expect(page.url()).not.toContain(token);
  await page.reload();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const row = page.getByRole('listitem').filter({ hasText: 'Private agent' });
  await row.getByRole('button', { name: 'Revoke key' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click();
  expect(
    (
      await request.get(`/v1/projects/${projectId}`, {
        headers: { authorization: `Bearer ${token}` },
      })
    ).status(),
  ).toBe(200);
  await row.getByRole('button', { name: 'Revoke key' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Revoke key' }).click();
  await expect(row).toContainText('Revoked');
  expect(
    (
      await request.get(`/v1/projects/${projectId}`, {
        headers: { authorization: `Bearer ${token}` },
      })
    ).status(),
  ).toBe(401);
  const signedOut = await page.request.post('/api/auth/sign-out', {
    headers: { origin: new URL(page.url()).origin, 'x-backbricks-csrf': '1' },
  });
  expect(signedOut.ok()).toBe(true);
  await page.locator('summary').filter({ hasText: 'Create key' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Expired session attempt');
  await page.getByLabel('No expiration', { exact: true }).check();
  await page.getByRole('button', { name: 'Create key', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('session has expired');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await expect(page).toHaveURL(/\/login\?/);
});

test.describe('agent key connection', () => {
  for (const language of ['en', 'de'] as const) {
    test(`connects an agent with a credential-free prompt (${language})`, async ({ browser }) => {
      const copy = messages(language);
      const context = await browser.newContext({
        locale: language === 'de' ? 'de-DE' : 'en-US',
        viewport: { width: 1360, height: 900 },
        extraHTTPHeaders: testHeaders(),
      });
      try {
        const page = await context.newPage();
        await createAccount(page, language);
        await createOrganization(page, 'Agent organization', undefined, language);
        const projectId = await createProject(page, 'Agent website', language);
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto(`/projects/${projectId}/embed`);
        const wizard = page.locator('details').filter({ hasText: copy.keys.agentConnection.title });
        await wizard.locator('summary').click();
        await expect(wizard).toContainText(copy.keys.noPublicKey);
        await wizard.getByLabel(copy.common.name, { exact: true }).fill('Agent connection');
        await wizard.getByLabel(copy.keys.noExpiry).check();
        const request = page.waitForRequest(
          (outgoing) =>
            outgoing.method() === 'POST' && new URL(outgoing.url()).pathname.endsWith('/keys'),
        );
        await wizard.getByRole('button', { name: copy.keys.create, exact: true }).click();
        expect((await request).postDataJSON()).toMatchObject({ kind: 'secret', preset: 'agent' });
        const dialog = page.getByRole('dialog');
        const token = await dialog.getByLabel(copy.keys.revealTitle).inputValue();
        await dialog.getByRole('button', { name: copy.common.close, exact: true }).click();
        await page.evaluate(
          'Object.defineProperty(navigator, "clipboard", { value: {writeText: async (text) => { globalThis.copiedPrompt = text; }}, configurable: true })',
        );
        await wizard.getByRole('button', { name: copy.keys.agentConnection.copy }).click();
        await expect(wizard.getByRole('status')).toContainText(copy.common.copied);
        const prompt: string = await page.evaluate('globalThis.copiedPrompt');
        expect(prompt).toContain('BACKBRICKS_SECRET_KEY');
        expect(prompt).toContain(projectId);
        expect(prompt.includes(token)).toBe(false);
        await wizard.locator('summary').click();
        await wizard.locator('summary').click();
        await expect(page.getByRole('dialog')).toHaveCount(0);
      } finally {
        await context.close();
      }
    });
  }
});
