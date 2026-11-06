import { randomUUID } from 'node:crypto';

import { expect, type Page } from '@playwright/test';

import de from '../apps/web/src/i18n/de.json' with { type: 'json' };
import en from '../apps/web/src/i18n/en.json' with { type: 'json' };
import { receivedMail } from '../scripts/test/mailpit.ts';

export type TestLanguage = 'en' | 'de';
export const messages = (language: TestLanguage) => (language === 'de' ? de : en);

export const accountPassword = 'test-password-for-e2e-1234';
/** Real browser identity setup; Mailpit recipient is unique and never globally cleared. */
export async function createAccount(page: Page, language: TestLanguage = 'en') {
  const copy = messages(language);
  const email = `owner-${randomUUID()}@example.test`;
  await page.goto('/signup');
  await page.getByLabel(copy.auth.name).fill('Website owner');
  await page.getByLabel(copy.auth.email).fill(email);
  await page.getByLabel(copy.auth.password, { exact: true }).fill(accountPassword);
  await page.getByRole('button', { name: copy.auth.signup.submit, exact: true }).click();
  await expect(page.getByRole('status')).toHaveText(copy.auth.signup.success);
  let verification = '';
  await expect
    .poll(async () => {
      const mail = await receivedMail(email).catch(() => null);
      verification = mail?.Text.match(/https?:\/\/\S+/)?.[0] ?? '';
      return verification;
    })
    .toContain('/verify-email');
  await page.goto(verification);
  await page.getByLabel(copy.auth.email).fill(email);
  await page.getByLabel(copy.auth.password, { exact: true }).fill(accountPassword);
  await page.getByRole('button', { name: copy.auth.login.submit, exact: true }).click();
  await expect(page.getByRole('button', { name: copy.common.signOut })).toBeVisible();
  return email;
}

export async function createOrganization(
  page: Page,
  name: string,
  slug = `team-${randomUUID()}`,
  language: TestLanguage = 'en',
) {
  const copy = messages(language);
  await page.getByRole('link', { name: copy.dashboard.newOrganization }).click();
  await page.getByLabel(copy.common.name, { exact: true }).fill(name);
  await page.getByLabel(copy.common.address, { exact: true }).fill(slug);
  await page.getByRole('button', { name: copy.common.create, exact: true }).click();
  await expect(
    page.getByRole('heading', { name: copy.dashboard.projects, exact: true }),
  ).toBeVisible();
  return await page.getByLabel(copy.dashboard.organization, { exact: true }).inputValue();
}
export async function createProject(page: Page, name: string, language: TestLanguage = 'en') {
  const copy = messages(language);
  await page.locator('summary').filter({ hasText: copy.projects.create }).click();
  await page.getByLabel(copy.common.name, { exact: true }).fill(name);
  await page.getByLabel(copy.common.address, { exact: true }).fill(`website-${randomUUID()}`);
  await page.getByLabel(copy.projects.domains).fill('https://example.test');
  await page.getByRole('button', { name: copy.projects.create, exact: true }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  return new URL(page.url()).pathname.split('/')[2]!;
}
