import { messages } from './accounts.ts';
import { setUpExample } from './example-site.ts';
import { expect, test, testHeaders } from './fixtures.ts';

for (const language of ['en', 'de'] as const) {
  test(`reviews example and moderation (${language})`, async ({ browser, baseURL }) => {
    if (!baseURL) throw new Error('The dashboard base URL is required.');
    const copy = messages(language);
    const owner = await browser.newContext({
      locale: language === 'de' ? 'de-DE' : 'en-US',
      viewport: { width: 1360, height: 900 },
      extraHTTPHeaders: testHeaders(),
    });
    const page = await owner.newPage();
    const setup = await setUpExample(page, baseURL, language);
    if (language === 'de') await page.setViewportSize({ width: 390, height: 900 });
    const visitor = await browser.newContext({ extraHTTPHeaders: {} });
    try {
      await page.goto(`/projects/${setup.projectId}/reviews`);
      await page.getByLabel(copy.common.name, { exact: true }).fill('Testimonials');
      await page.getByLabel(copy.common.address, { exact: true }).fill('testimonials');
      await page.getByRole('button', { name: copy.reviews.create }).click();
      await expect(page.getByRole('tab', { name: copy.reviews.tabs.to_review })).toBeVisible();
      await expect(page.getByText(copy.reviews.empty.to_review)).toBeVisible();
      const site = await visitor.newPage();
      await site.goto(`${setup.site.url}/reviews.html`);
      await expect(site.getByText('No published reviews yet.')).toBeVisible();
      await site.getByLabel('Rating').fill('4');
      await site.getByLabel('Name', { exact: true }).fill('Ada Lovelace');
      await site.getByLabel('Email').fill('review-canary@example.com');
      await site.getByLabel('Title').fill('Great service');
      await site.getByLabel('Review', { exact: true }).fill('<b>Plain text</b>');
      await site.getByRole('button', { name: 'Send review' }).click();
      await expect(site.getByText('Thank you. Your review is awaiting moderation.')).toBeVisible();
      await page.reload();
      const card = page.getByRole('article', {
        name: copy.reviews.cardLabel.replace('{{author}}', 'Ada Lovelace'),
      });
      await expect(card).toBeVisible();
      expect(
        await page
          .locator('html')
          .evaluate((element) => Number(Reflect.get(element, 'scrollWidth'))),
      ).toBeLessThanOrEqual(page.viewportSize()?.width ?? 0);
      await card.getByRole('button', { name: copy.reviews.details }).focus();
      await page.keyboard.press('a');
      await expect(card.getByRole('button', { name: copy.reviews.actions.publish })).toBeVisible();
      await expect(site.getByText('No published reviews yet.')).toBeVisible();
      await card.getByRole('button', { name: copy.reviews.actions.publish }).click();
      await page.getByRole('tab', { name: copy.reviews.tabs.published }).click();
      await expect(card).toBeVisible();
      await site.reload();
      await expect(site.getByText('1 published review')).toBeVisible();
      await expect(site.getByText('<b>Plain text</b>', { exact: true })).toBeVisible();
      await expect(site.getByText('Ada L.')).toBeVisible();
      await expect(site.getByText('review-canary@example.com')).toHaveCount(0);
      await page.getByRole('tab', { name: copy.reviews.tabs.stats }).click();
      await expect(page.getByText(copy.reviews.distribution)).toBeVisible();
      await page.getByRole('tab', { name: copy.reviews.tabs.published }).click();
      await card.getByRole('button', { name: copy.reviews.actions.unpublish }).click();
      await expect(card).toHaveCount(0);
      await site.reload();
      await expect(site.getByText('No published reviews yet.')).toBeVisible();
      await page.getByRole('tab', { name: copy.reviews.tabs.to_review }).click();
      await card.getByRole('button', { name: copy.reviews.details }).focus();
      await page.keyboard.press('r');
      await expect(card).toHaveCount(0);
      await page.getByRole('tab', { name: copy.reviews.tabs.rejected }).click();
      await expect(card).toBeVisible();

      await page.getByRole('tab', { name: copy.reviews.tabs.settings }).click();
      await page.getByLabel(copy.reviews.verificationMethod).fill('Order records');
      await page.getByRole('checkbox', { name: copy.reviews.required.emailRequired }).check();
      await page.getByRole('button', { name: copy.common.save, exact: true }).click();
      await expect
        .poll(async () => {
          const response = await setup.request.get(
            `${setup.project}/review-collections/testimonials`,
            {
              headers: setup.headers,
            },
          );
          return response.json();
        })
        .toMatchObject({ config: { emailRequired: true, verificationMethod: 'Order records' } });
      await page.getByRole('tab', { name: copy.reviews.tabs.embed }).click();
      await expect(page.getByText(copy.reviews.transparency)).toBeVisible();
      await expect(page.getByText(/"email": "ada@example.com"/)).toBeVisible();
    } finally {
      await visitor.close();
      await setup.site.close();
      await owner.close();
    }
  });
}
