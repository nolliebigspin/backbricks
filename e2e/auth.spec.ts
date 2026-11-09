import { randomUUID } from 'node:crypto';

import { receivedMail } from '../scripts/test/mailpit.ts';
import { expect, test } from './fixtures.ts';

const password = 'test-password-for-e2e-1234';
test('signup, verification, password reset and safe account navigation', async ({ page }) => {
  const email = `auth-${randomUUID()}@example.test`;
  await page.goto('/');
  await expect(page).toHaveURL(/\/login(?:\?.*)?$/);
  await page.getByRole('link', { name: 'Create an account' }).click();
  await page.getByLabel('Your name').fill('Website owner');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
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
  await expect(page).toHaveURL(/\/login(?:\?.*)?$/);
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByRole('link', { name: 'Forgot password?' }).click();
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('status')).toContainText('reset link is on its way');
  let reset = '';
  await expect
    .poll(async () => {
      const mail = await receivedMail(email, 0, 'Reset').catch(() => null);
      reset = mail?.Text.match(/https?:\/\/\S+/)?.[0] ?? '';
      return reset;
    })
    .toContain('/reset-password');
  await page.goto(reset);
  await expect(page).toHaveURL(/\/reset-password$/);
  await page.getByLabel('Password', { exact: true }).fill(`${password}-new`);
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page.getByRole('status')).toContainText('password has been changed');
  await page.goto('/login?redirect=https://evil.test');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(`${password}-new`);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/accept-invitation');
  await expect(page.getByRole('alert')).toContainText('invalid, expired');
});
