import { fileURLToPath } from 'node:url';

import { expect, test } from './fixtures.ts';
import { serveStaticBuild } from './static-build.ts';

test('production docs expose the API reference and the canonical artifacts', async ({
  browser,
}) => {
  const site = await serveStaticBuild(fileURLToPath(new URL('../apps/www/dist', import.meta.url)));
  const context = await browser.newContext({ extraHTTPHeaders: {} });
  try {
    const page = await context.newPage();
    const cspViolations: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error' && message.text().includes('Content Security Policy'))
        cspViolations.push(message.text());
    });
    await page.goto(`${site.url}/docs`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Backbricks documentation');
    const meta = page.locator('meta[http-equiv="content-security-policy" i]');
    await expect(meta).toHaveAttribute('content', /default-src 'self'/);
    await expect(meta).not.toHaveAttribute('content', /'unsafe-inline'/);
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page.locator('dialog input').fill('CLI');
    await expect(
      page.getByRole('dialog').getByRole('link', { name: 'CLI and MCP' }).first(),
    ).toBeVisible();
    expect(cspViolations).toEqual([]);
    await page.keyboard.press('Escape');
    await page.getByRole('link', { name: 'Open the API reference' }).click();
    await expect(page.getByText('Download OpenAPI JSON')).toBeVisible();
    await expect(page.locator('#api-reference')).toContainText('Backbricks', { timeout: 15_000 });
    const error = await context.request.get(`${site.url}/errors/validation_failed`);
    expect(error.status()).toBe(200);
    expect(await error.text()).toContain('Validation failed');
    const schema = await context.request.get(`${site.url}/schema/config.v1.json`);
    expect(schema.status()).toBe(200);
    expect(await schema.json()).toMatchObject({
      $id: 'https://backbricks.app/schema/config.v1.json',
    });
    const agents = await context.request.get(`${site.url}/llms-full.txt`);
    expect(await agents.text()).toContain('backbricks doctor');
  } finally {
    await context.close();
    await site.close();
  }
});
