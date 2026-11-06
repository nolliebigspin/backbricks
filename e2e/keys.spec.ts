import { expect, test } from '@playwright/test';

import { createAccount, createOrganization, createProject } from './accounts.ts';

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
});
