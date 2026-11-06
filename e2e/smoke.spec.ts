import { expect, test } from './fixtures.ts';

test('the dashboard loads', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Backbricks');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('a deep link loads the dashboard (SPA fallback)', async ({ page }) => {
  await page.goto('/projects/prj_123/settings');
  await expect(page).toHaveTitle('Backbricks');
});

test('German browsers get the German dashboard', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'de-DE' });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Anmelden' })).toBeVisible();
  await context.close();
});

test('health and API errors', async ({ request }) => {
  expect((await request.get('/healthz')).status()).toBe(200);
  expect((await request.get('/readyz')).status()).toBe(200);
  const missing = await request.get('/v1/nope');
  expect(missing.status()).toBe(404);
  expect(missing.headers()['content-type']).toBe('application/problem+json');
});
