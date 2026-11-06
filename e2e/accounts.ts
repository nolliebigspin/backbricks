import { randomUUID } from 'node:crypto';

import { expect, type Page } from '@playwright/test';

import { receivedMail } from '../scripts/test/mailpit.ts';

export const accountPassword = 'test-password-for-e2e-1234';
/** Real browser identity setup; Mailpit recipient is unique and never globally cleared. */
export async function createAccount(page: Page) {
  const email = `owner-${randomUUID()}@example.test`;
  await page.goto('/signup');
  await page.getByLabel('Your name').fill('Website owner');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(accountPassword);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Check your email');
  let verification = '';
  await expect
    .poll(async () => {
      const mail = await receivedMail(email).catch(() => null);
      verification = mail?.Text.match(/https?:\/\/\S+/)?.[0] ?? '';
      return verification;
    })
    .toContain('/verify-email');
  await page.goto(verification);
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(accountPassword);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  return email;
}

export async function createOrganization(page: Page, name: string, slug = `team-${randomUUID()}`) {
  await page.getByRole('link', { name: 'New organization' }).click();
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Short name', { exact: true }).fill(slug);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible();
  return await page.getByLabel('Organization', { exact: true }).inputValue();
}
export async function createProject(page: Page, name: string) {
  await page.locator('summary').filter({ hasText: 'Create project' }).click();
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Short name', { exact: true }).fill(`website-${randomUUID()}`);
  await page.getByLabel('Allowed websites').fill('https://example.test');
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  return new URL(page.url()).pathname.split('/')[2]!;
}
