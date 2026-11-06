import { randomUUID } from 'node:crypto';

import { receivedMail } from '../scripts/test/mailpit.ts';
import {
  accountPassword,
  createAccount,
  createOrganization,
  createProject,
  messages,
} from './accounts.ts';
import { expect, test, testHeaders } from './fixtures.ts';

for (const language of ['en', 'de'] as const) {
  test(`complete M1 owner journey (${language})`, async ({ browser, request }) => {
    const copy = messages(language);
    const context = await browser.newContext({
      locale: language === 'de' ? 'de-DE' : 'en-US',
      extraHTTPHeaders: testHeaders(),
    });
    const page = await context.newPage();
    const email = await createAccount(page, language);
    const orgId = await createOrganization(page, `Owner team ${language}`, undefined, language);
    const projectId = await createProject(page, `Owner website ${language}`, language);
    await page.getByRole('link', { name: copy.dashboard.embed, exact: true }).click();
    await page.locator('summary').filter({ hasText: copy.keys.create }).click();
    await page.getByLabel(copy.common.name, { exact: true }).fill('Owner key');
    await page.getByLabel(copy.keys.kind).selectOption('secret');
    await page.getByLabel(copy.keys.noExpiry, { exact: true }).check();
    await page.getByRole('button', { name: copy.keys.create, exact: true }).click();
    const token = await page.getByRole('dialog').getByLabel(copy.keys.revealTitle).inputValue();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: copy.common.close, exact: true })
      .click();
    await page.getByLabel(copy.common.name, { exact: true }).fill('Website key');
    await page.getByLabel(copy.keys.kind).selectOption('publishable');
    await page.getByRole('button', { name: copy.keys.create, exact: true }).click();
    const publicToken = await page
      .getByRole('dialog')
      .getByLabel(copy.keys.revealTitle)
      .inputValue();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: copy.common.close, exact: true })
      .click();
    const publicHeaders = {
      authorization: `Bearer ${publicToken}`,
      origin: 'https://example.test',
    };
    const challenge = await request.get('/v1/public/challenge', { headers: publicHeaders });
    expect(challenge.status()).toBe(200);
    const challengeText = await challenge.text();
    expect(challengeText).not.toContain(projectId);
    expect(challengeText).not.toContain(orgId);
    expect(
      (
        await request.get('/v1/public/challenge', {
          headers: { ...publicHeaders, origin: 'https://foreign.example.test' },
        })
      ).status(),
    ).toBe(403);
    expect(
      (await request.get(`/v1/projects/${projectId}`, { headers: publicHeaders })).status(),
    ).toBe(403);
    const publicRow = page.getByRole('listitem').filter({ hasText: 'Website key' });
    await publicRow.getByRole('button', { name: copy.keys.revoke }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: copy.keys.revoke }).click();
    await expect(publicRow).toContainText(copy.keys.revoked);
    expect((await request.get('/v1/public/challenge', { headers: publicHeaders })).status()).toBe(
      404,
    );
    const foreign = await request.get(`/v1/projects/${projectId}`, {
      headers: { authorization: `Bearer ${token}`, origin: 'https://foreign.example.test' },
    });
    expect(foreign.status()).toBe(403);
    expect(await foreign.json()).toMatchObject({ code: 'secret_key_exposed' });
    const unchanged = await request.get(`/v1/projects/${projectId}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(unchanged.status()).toBe(200);
    expect(await unchanged.json()).toMatchObject({ name: `Owner website ${language}` });
    await page.getByRole('link', { name: copy.dashboard.members, exact: true }).click();
    const invited = `journey-${randomUUID()}@example.test`;
    await page.getByLabel(copy.auth.email).fill(invited);
    await page.getByRole('button', { name: copy.members.invite, exact: true }).click();
    await expect(page.getByRole('listitem').filter({ hasText: invited })).toContainText(
      copy.members.status.pending,
    );
    let link = '';
    await expect
      .poll(async () => {
        const mail = await receivedMail(invited).catch(() => null);
        link = mail?.Text.match(/https?:\/\/\S+/)?.[0] ?? '';
        return link;
      })
      .toContain('/accept-invitation');
    const invitedContext = await browser.newContext({
      locale: language === 'de' ? 'de-DE' : 'en-US',
      extraHTTPHeaders: testHeaders(),
    });
    const member = await invitedContext.newPage();
    await member.goto(link);
    await member.getByLabel(copy.auth.name).fill('Journey teammate');
    await member.getByLabel(copy.auth.email).fill(invited);
    await member.getByLabel(copy.auth.password, { exact: true }).fill(accountPassword);
    await member.getByRole('button', { name: copy.auth.invitation.submit, exact: true }).click();
    await expect(member.getByRole('button', { name: copy.common.signOut })).toBeVisible();
    await member.getByLabel(copy.dashboard.organization, { exact: true }).selectOption(orgId);
    await expect(member.getByRole('link', { name: `Owner website ${language}` })).toBeVisible();
    await page.getByRole('link', { name: copy.dashboard.projects, exact: true }).click();
    await page.getByRole('link', { name: `Owner website ${language}` }).click();
    await page.getByRole('link', { name: copy.dashboard.embed, exact: true }).click();
    await page
      .getByRole('listitem')
      .filter({ hasText: 'Owner key' })
      .getByRole('button', { name: copy.keys.revoke })
      .click();
    await page.getByRole('alertdialog').getByRole('button', { name: copy.keys.revoke }).click();
    await expect(page.getByRole('listitem').filter({ hasText: 'Owner key' })).toContainText(
      copy.keys.revoked,
    );
    expect(
      (
        await request.get(`/v1/projects/${projectId}`, {
          headers: { authorization: `Bearer ${token}` },
        })
      ).status(),
    ).toBe(401);
    await page.getByRole('link', { name: copy.dashboard.activity, exact: true }).click();
    for (const action of [
      copy.activity.actions.keyCreated,
      copy.activity.actions.keyRevoked,
      copy.activity.actions.invitationCreated,
      copy.activity.actions.memberJoined,
      copy.activity.actions.secretExposed,
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- Each localized audit action must be visible in the same owner view.
      await expect(page.getByText(action, { exact: true }).first()).toBeVisible();
    }
    const activity = await page.locator('main').textContent();
    expect(activity).not.toContain(email);
    expect(activity).not.toContain(invited);
    expect(activity).not.toContain(token);
    // Exercise actual activity pagination, without UI fixtures or a parallel audit data source.
    for (let index = 0; index < 22; index++) {
      // oxlint-disable-next-line no-await-in-loop -- The API serializes administrative project writes under the tenant boundary.
      const response = await page.request.post('/v1/projects', {
        headers: {
          origin: new URL(page.url()).origin,
          'x-backbricks-csrf': '1',
          'x-backbricks-organization-id': orgId,
        },
        data: { name: `Pagination ${index}`, slug: `pagination-${index}` },
      });
      expect(response.status()).toBe(201);
    }
    await page.reload();
    await page.getByRole('button', { name: copy.common.more }).click();
    await expect(
      page.getByText(copy.activity.actions.organizationCreated, { exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: `.turbo/m1-owner-${language}.png`, fullPage: true });
    await invitedContext.close();
    await context.close();
  });
}
