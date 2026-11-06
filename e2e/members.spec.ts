import { randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';

import { receivedMail } from '../scripts/test/mailpit.ts';
import { accountPassword, createAccount, createOrganization, createProject } from './accounts.ts';

test('invitations, membership permissions, last owner and safe activity', async ({
  page,
  browser,
}) => {
  const ownerEmail = await createAccount(page);
  const orgId = await createOrganization(page, 'Members organization');
  const projectId = await createProject(page, 'Team website');
  await page.getByRole('link', { name: 'Members', exact: true }).click();
  const owner = page.getByRole('listitem').filter({ hasText: ownerEmail });
  await owner.getByLabel('Role').selectOption('admin');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('alert')).toContainText('at least one owner');
  const invitedEmail = `member-${randomUUID()}@example.test`;
  await page.getByLabel('Email address').fill(invitedEmail);
  await page.getByRole('button', { name: 'Invite member', exact: true }).click();
  const invitation = page.getByRole('listitem').filter({ hasText: invitedEmail });
  await expect(invitation).toContainText('Pending');
  await invitation.getByRole('button', { name: 'Resend invitation' }).click();
  await expect(page.getByRole('status')).toContainText('Saved');
  let link = '';
  await expect
    .poll(async () => {
      const mail = await receivedMail(invitedEmail).catch(() => null);
      link = mail?.Text.match(/https?:\/\/\S+/)?.[0] ?? '';
      return link;
    })
    .toContain('/accept-invitation');
  const context = await browser.newContext();
  const member = await context.newPage();
  await member.goto(link);
  await member.getByLabel('Your name').fill('Invited teammate');
  await member.getByLabel('Email address').fill(invitedEmail);
  await member.getByLabel('Password', { exact: true }).fill(accountPassword);
  await member.getByRole('button', { name: 'Join team' }).click();
  await expect(member.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await member.getByLabel('Organization', { exact: true }).selectOption(orgId);
  await member.getByRole('link', { name: 'Team website' }).click();
  await member.getByRole('link', { name: 'Embed', exact: true }).click();
  await expect(
    member.getByText('Only owners and administrators can create or revoke keys.'),
  ).toBeVisible();
  await expect(member.locator('summary')).toHaveCount(0);
  await member.goto('/members');
  await expect(member.getByRole('alert')).toContainText('Only owners');
  await page.reload();
  const teammate = page
    .getByRole('listitem')
    .filter({ hasText: invitedEmail })
    .filter({ has: page.getByLabel('Role') });
  await teammate.getByLabel('Role').selectOption('admin');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Save changes' }).click();
  await expect(teammate.getByLabel('Role')).toHaveValue('admin');
  await member.goto(`/projects/${projectId}/embed`);
  await expect(member.locator('summary').filter({ hasText: 'Create key' })).toBeVisible();
  await page.getByRole('link', { name: 'Activity', exact: true }).click();
  await expect(page.getByText('Invitation created', { exact: true })).toBeVisible();
  await expect(page.getByText('Member joined', { exact: true })).toBeVisible();
  await expect(page.getByText('Member role changed', { exact: true })).toBeVisible();
  expect(await page.locator('main').textContent()).not.toContain(invitedEmail);
  expect(await page.locator('main').textContent()).not.toContain(ownerEmail);
  await page.getByRole('link', { name: 'Members', exact: true }).click();
  await page.getByLabel('Email address').fill(`cancel-${randomUUID()}@example.test`);
  await page.getByRole('button', { name: 'Invite member', exact: true }).click();
  const pending = page.getByRole('listitem').filter({ hasText: 'cancel-' });
  await pending.getByRole('button', { name: 'Cancel invitation' }).click();
  await expect(pending).toContainText('Canceled');
  const target = page
    .getByRole('listitem')
    .filter({ hasText: invitedEmail })
    .filter({ has: page.getByLabel('Role') });
  await target.getByRole('button', { name: 'Remove member' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Remove member' }).click();
  await expect(target).toHaveCount(0);
  await member.goto(`/projects/${projectId}/settings`);
  await expect(member.getByRole('alert')).toContainText('unavailable');
  await context.close();
});
