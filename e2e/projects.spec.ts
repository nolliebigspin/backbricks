import { createAccount, createOrganization, createProject } from './accounts.ts';
import { expect, test } from './fixtures.ts';

test('organization and project isolation, origin settings and mobile navigation', async ({
  page,
}) => {
  await createAccount(page);
  const firstOrg = await createOrganization(page, 'First organization');
  const firstProject = await createProject(page, 'First website');
  await expect(page.getByRole('link', { name: 'Inbox', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Allowed websites').fill('https://example.test/path');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('alert')).toContainText('without a path');
  await page.getByLabel('Allowed websites').fill('https://www.example.test\nhttp://localhost:5173');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('status')).toContainText('Saved');
  await page.reload();
  await expect(page.getByLabel('Allowed websites')).toHaveValue(
    'http://localhost:5173\nhttps://www.example.test',
  );
  await page.getByLabel('Allowed websites').fill('');
  await expect(
    page.getByLabel('Allow submissions from any website.', { exact: false }),
  ).toBeVisible();
  await page.getByLabel('Allow submissions from any website.', { exact: false }).check();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('status')).toContainText('Saved');
  const secondOrg = await createOrganization(page, 'Second organization');
  await createProject(page, 'Second website');
  await page.goto(`/projects/${firstProject}/settings`);
  await expect(page.getByRole('alert')).toContainText('unavailable');
  await expect(page.getByLabel('Allowed websites')).toHaveCount(0);
  await page.getByLabel('Organization', { exact: true }).selectOption(firstOrg);
  await expect(page.getByRole('link', { name: 'First website' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Second website' })).toHaveCount(0);
  await page.getByLabel('Organization', { exact: true }).selectOption(secondOrg);
  await expect(page.getByRole('link', { name: 'Second website' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'First website' })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('link', { name: 'Second website' }).click();
  await expect(page.getByLabel('Project', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Settings', exact: true })).toBeVisible();
  expect(await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')).toBe(
    true,
  );
  // Hold an earlier organization's actual response while switching again.
  let release: (() => void) | undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let captured = false;
  await page.route('**/v1/projects?*', async (route) => {
    if (route.request().headers()['x-backbricks-organization-id'] !== firstOrg) {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    captured = true;
    await held;
    await route.fulfill({ response }).catch(() => undefined);
  });
  await page.getByLabel('Organization', { exact: true }).selectOption(firstOrg);
  await expect.poll(() => captured).toBe(true);
  await page.getByLabel('Organization', { exact: true }).selectOption(secondOrg);
  release?.();
  await expect(page.getByRole('link', { name: 'Second website' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'First website' })).toHaveCount(0);
});
