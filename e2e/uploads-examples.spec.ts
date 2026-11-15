import { randomUUID } from 'node:crypto';
import { appendFile, readFile } from 'node:fs/promises';

import { instanceResponseSchema } from '@backbricks/core';
import { z } from 'zod';

import { EICAR_TEST_BYTES } from '../scripts/test/clamav.ts';
import { garageTestSettings } from '../scripts/test/garage.ts';
import { receivedMail } from '../scripts/test/mailpit.ts';
import { acceptInvitation, messages } from './accounts.ts';
import { setUpExample } from './example-site.ts';
import { expect, test, testHeaders } from './fixtures.ts';

const filePage = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      status: z.string(),
      scanStatus: z.string().nullable(),
    }),
  ),
});
const idSchema = z.object({ id: z.string() });
const source = new URL('../examples/html/application.json', import.meta.url);
const pdf = Buffer.from('%PDF-1.7\nPrivate application content\n%%EOF');
const name = 'cv<img onerror=alert(1)>.pdf';
for (const language of ['en', 'de'] as const)
  test(`uploads example reaches Files and Inbox with safe downloads (${language})`, async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(240000);
    const scanned = test.info().config.metadata['scanner'] === 'clamav';
    const copy = messages(language);
    const siteCopy = messages('en').uploads.example;
    const context = await browser.newContext({
      locale: language === 'de' ? 'de-DE' : 'en-US',
      extraHTTPHeaders: testHeaders(),
    });
    const page = await context.newPage();
    const siteOrigin = garageTestSettings.corsOrigins.findLast((origin) => origin !== '*');
    if (!siteOrigin) throw new Error('The upload example needs an allowed Garage loopback origin.');
    const setup = await setUpExample(page, baseURL!, language, siteOrigin);
    const visitor = await browser.newContext({ extraHTTPHeaders: {} });
    const ids: string[] = [];
    const responses: Promise<void>[] = [];
    let puts = 0;
    let intents = 0;
    let memberContext: Awaited<ReturnType<typeof browser.newContext>> | undefined;
    try {
      await page.getByRole('link', { name: copy.uploads.title, exact: true }).click();
      await page.getByRole('link', { name: copy.uploads.zones, exact: true }).click();
      await page.getByLabel(copy.common.name, { exact: true }).fill('Applications');
      await page.getByLabel(copy.common.address, { exact: true }).fill('cv');
      await page
        .getByLabel(copy.forms.create.template)
        .selectOption(`cv-${scanned ? '' : 'unscanned-'}${language}`);
      await page.getByRole('button', { name: copy.uploads.create, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/projects/${setup.projectId}/upload-zones/cv$`));
      await page.getByRole('tab', { name: copy.dashboard.settings, exact: true }).click();
      await page.getByLabel(copy.uploads.maxSize).fill('6');
      const saved = page.waitForResponse(
        (response) =>
          response.request().method() === 'PUT' &&
          new URL(response.url()).pathname.endsWith('/upload-zones/cv'),
      );
      await page.getByRole('button', { name: copy.common.save, exact: true }).click();
      expect((await saved).status()).toBe(200);
      const zone = instanceResponseSchema.parse(
        await (
          await setup.request.get(`${setup.project}/upload-zones/cv`, { headers: setup.headers })
        ).json(),
      );
      expect(zone.config).toMatchObject({ maxSizeMb: 6, scanRequired: scanned });
      // Generous fixture limits keep this journey focused; separate real tests prove rate limiting.
      expect(
        (
          await setup.request.patch(`${setup.project}/upload-zones/cv`, {
            headers: setup.headers,
            data: {
              configVersion: zone.configVersion,
              config: { limits: { perMinute: 100, perHour: 1000 } },
            },
          })
        ).status(),
      ).toBe(200);
      const form = await setup.request.post(`${setup.project}/forms`, {
        headers: setup.headers,
        data: {
          key: 'application',
          name: 'Application',
          config: JSON.parse(await readFile(source, 'utf8')),
        },
      });
      expect(form.status()).toBe(201);
      await page.getByRole('tab', { name: copy.dashboard.embed, exact: true }).click();
      await page.getByRole('tab', { name: copy.uploads.attachmentExample, exact: true }).click();
      await expect(page.getByText(copy.uploads.attachmentSetup)).toBeVisible();
      const site = await visitor.newPage();
      site.on('request', (request) => {
        if (request.method() === 'PUT') puts++;
        if (
          new URL(request.url()).pathname.endsWith('/upload-zones/cv/files') &&
          request.method() === 'POST'
        )
          intents++;
      });
      site.on('response', (response) => {
        if (new URL(response.url()).pathname.endsWith('/upload-zones/cv/files') && response.ok())
          responses.push(
            response.json().then((value) => {
              ids.push(z.object({ fileId: z.string() }).parse(value).fileId);
              return undefined;
            }),
          );
      });
      await site.goto(`${setup.site.url}/upload.html`);
      await site.getByLabel(siteCopy.email, { exact: true }).fill('ada@localhost');
      await site
        .getByLabel(siteCopy.file, { exact: true })
        .setInputFiles({ name, mimeType: 'application/pdf', buffer: pdf });
      await site.getByRole('button', { name: siteCopy.submit, exact: true }).click();
      await expect(site.locator('output')).toContainText('email:', { timeout: 90000 });
      expect(puts).toBe(1);
      expect(intents).toBe(1);
      await site.getByLabel(siteCopy.email, { exact: true }).fill('ada@example.com');
      await site.getByRole('button', { name: siteCopy.submit, exact: true }).click();
      await expect(site.locator('output')).toHaveText(siteCopy.sent, { timeout: 90000 });
      expect(puts).toBe(1);
      expect(intents).toBe(1);
      await Promise.all(responses);
      const fileId = ids[0];
      if (!fileId) throw new Error('Expected the application file.');
      const files = filePage.parse(
        await (
          await setup.request.get(`${setup.project}/files`, { headers: setup.headers })
        ).json(),
      );
      expect(files.data).toContainEqual({
        id: fileId,
        name,
        status: 'ready',
        scanStatus: scanned ? 'clean' : 'not_scanned',
      });
      await page.goto(`/projects/${setup.projectId}/files`);
      const row = page.getByRole('row').filter({ hasText: name });
      await expect(row).toBeVisible();
      expect(await row.locator('img').count()).toBe(0);
      await page.getByRole('button', { name: copy.uploads.grid, exact: true }).click();
      await expect(page.getByRole('listitem').filter({ hasText: name })).toBeVisible();
      await page.getByRole('button', { name: copy.uploads.table, exact: true }).click();
      await page.getByLabel(copy.uploads.search).fill('onerror');
      await page
        .getByRole('button', { name: copy.forms.entries.searchButton, exact: true })
        .click();
      await expect(row).toBeVisible();
      await page.getByRole('button', { name: copy.uploads.open.replace('{{name}}', name) }).click();
      const drawer = page.getByRole('dialog');
      await expect(
        drawer.getByRole('button', { name: copy.uploads.download, exact: true }),
      ).toBeVisible();
      await expect(
        drawer.getByRole('button', { name: copy.uploads.preview, exact: true }),
      ).toHaveCount(0);
      const downloading = page.waitForEvent('download');
      await drawer.getByRole('button', { name: copy.uploads.download, exact: true }).click();
      const downloaded = await downloading;
      expect(downloaded.suggestedFilename().endsWith('.pdf')).toBe(true);
      expect(await readFile(await downloaded.path())).toEqual(pdf);
      await drawer.getByRole('button', { name: copy.common.close, exact: true }).click();
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: `.turbo/m3-files-${language}-mobile.png`, fullPage: true });
      expect(
        await page
          .locator('html')
          .evaluate(
            (element: { scrollWidth: number; clientWidth: number }) =>
              element.scrollWidth <= element.clientWidth,
          ),
      ).toBe(true);
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(`/projects/${setup.projectId}/forms/application`);
      await page.getByRole('button', { name: /./ }).filter({ hasText: 'ada@example.com' }).click();
      const entryDrawer = page.getByRole('dialog');
      await expect(entryDrawer.getByText(name, { exact: true })).toBeVisible();
      await expect(entryDrawer.getByText(fileId, { exact: true })).toHaveCount(0);
      const attachmentDownload = page.waitForEvent('download');
      await entryDrawer.getByRole('button', { name: copy.uploads.download, exact: true }).click();
      expect(await readFile(await (await attachmentDownload).path())).toEqual(pdf);
      await page.screenshot({ path: `.turbo/m3-attachment-${language}.png`, fullPage: true });
      await entryDrawer.getByRole('button', { name: copy.common.close, exact: true }).click();
      const entries = z.object({ data: z.array(z.object({ id: z.string() })) }).parse(
        await (
          await setup.request.get(`${setup.project}/forms/application/submissions`, {
            headers: setup.headers,
          })
        ).json(),
      );
      const entryId = entries.data[0]?.id;
      if (!entryId) throw new Error('Expected the stored application.');
      const otherProject = await setup.request.post('/v1/projects', {
        headers: setup.headers,
        data: { name: 'Other upload website', slug: `other-${randomUUID()}` },
      });
      expect(otherProject.status()).toBe(201);
      const otherId = idSchema.parse(await otherProject.json()).id;
      await page.goto(`/projects/${setup.projectId}/files`);
      await page.getByLabel(copy.uploads.select.replace('{{name}}', name)).check();
      await page.getByLabel(copy.dashboard.project, { exact: true }).selectOption(otherId);
      await page.getByRole('link', { name: copy.uploads.title, exact: true }).click();
      await expect(page.getByText(name, { exact: true })).toHaveCount(0);
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await page.getByLabel(copy.dashboard.project, { exact: true }).selectOption(setup.projectId);
      // A real member sees individual file actions, without bulk selection or editable settings.
      await page.getByRole('link', { name: copy.dashboard.members, exact: true }).click();
      const invited = `uploads-${randomUUID()}@example.test`;
      await page.getByLabel(copy.auth.email).fill(invited);
      await page.getByRole('button', { name: copy.members.invite, exact: true }).click();
      let invitation = '';
      await expect
        .poll(async () => {
          invitation =
            (await receivedMail(invited).catch(() => null))?.Text.match(/https?:\/\/\S+/)?.[0] ??
            '';
          return invitation;
        })
        .toContain('/accept-invitation');
      const joined = await acceptInvitation(
        browser,
        invitation,
        invited,
        setup.organizationId,
        language,
      );
      memberContext = joined.context;
      const member = joined.page;
      await member.goto(`/projects/${setup.projectId}/upload-zones/cv`);
      await member.getByRole('tab', { name: copy.dashboard.settings, exact: true }).click();
      await expect(member.getByText(copy.forms.settings.readOnly)).toBeVisible();
      await expect(member.getByRole('button', { name: copy.common.save, exact: true })).toHaveCount(
        0,
      );
      await member.goto(`/projects/${setup.projectId}/files`);
      await expect(member.getByRole('row').filter({ hasText: name })).toBeVisible();
      await expect(member.getByRole('checkbox')).toHaveCount(0);
      await member
        .getByRole('button', { name: copy.uploads.open.replace('{{name}}', name) })
        .click();
      await member
        .getByRole('dialog')
        .getByRole('button', { name: copy.forms.entries.delete, exact: true })
        .click();
      await member
        .getByRole('alertdialog')
        .getByRole('button', { name: copy.forms.entries.delete, exact: true })
        .click();
      await page.goto(`/projects/${setup.projectId}/forms/application?entry=${entryId}`);
      await expect(
        page.getByRole('dialog').getByText(copy.uploads.missingAttachment),
      ).toBeVisible();
      await expect(
        page.getByRole('dialog').getByRole('button', { name: copy.uploads.download, exact: true }),
      ).toHaveCount(0);
      if (language === 'en' && scanned) {
        const recipients = z
          .object({ recipients: z.array(z.object({ id: z.string(), email: z.string() })) })
          .parse(
            await (
              await setup.request.get(`${setup.project}/notification-rules/options`, {
                headers: setup.headers,
              })
            ).json(),
          ).recipients;
        const recipient = recipients.find((value) => value.email === setup.email);
        if (!recipient) throw new Error('Expected verified owner recipient.');
        expect(
          (
            await setup.request.post(`${setup.project}/notification-rules`, {
              headers: setup.headers,
              data: {
                eventType: 'uploads.file.quarantined',
                instanceId: zone.id,
                recipientUserIds: [recipient.id],
              },
            })
          ).status(),
        ).toBe(201);
        await site.getByLabel(siteCopy.email, { exact: true }).fill('blocked@example.com');
        await site.getByLabel(siteCopy.file, { exact: true }).setInputFiles({
          name: 'blocked.pdf',
          mimeType: 'application/pdf',
          buffer: Buffer.from(EICAR_TEST_BYTES),
        });
        await site.getByRole('button', { name: siteCopy.submit, exact: true }).click();
        await expect(site.locator('output')).toContainText('blocked by the safety check', {
          timeout: 90000,
        });
        await page.goto(`/projects/${setup.projectId}/files`);
        const blocked = page.getByRole('row').filter({ hasText: 'blocked.pdf' });
        await expect(blocked).toContainText(copy.uploads.status.quarantined);
        await blocked.getByRole('button').click();
        await expect(
          page
            .getByRole('dialog')
            .getByRole('button', { name: copy.uploads.download, exact: true }),
        ).toHaveCount(0);
        await expect
          .poll(
            async () =>
              (await receivedMail(setup.email, 0, 'New entry: Applications').catch(() => null))
                ?.Subject ?? '',
            { timeout: 150000 },
          )
          .toContain('New entry: Applications');
        const mail = await receivedMail(setup.email, 0, 'New entry: Applications');
        for (const privateValue of [
          'blocked.pdf',
          'blocked@example.com',
          'EICAR',
          'uploadToken',
          'X-Amz',
        ])
          expect(`${mail.Text}${mail.HTML}`).not.toContain(privateValue);
      }

      if (language === 'en') {
        await site.getByLabel(siteCopy.email, { exact: true }).fill('invalid-file@example.com');
        await site.getByLabel(siteCopy.file, { exact: true }).setInputFiles({
          name: 'program.pdf',
          mimeType: 'application/pdf',
          buffer: Buffer.concat([Buffer.from('MZ'), Buffer.alloc(512)]),
        });
        await site.getByRole('button', { name: siteCopy.submit, exact: true }).click();
        await expect(site.locator('output')).toContainText('did not meet the upload rules', {
          timeout: 90000,
        });
        await page.goto(`/projects/${setup.projectId}/files`);
        await expect(page.getByRole('row').filter({ hasText: 'program.pdf' })).toContainText(
          copy.uploads.status.rejected,
        );
      }
    } finally {
      try {
        await visitor.close();
        await memberContext?.close();
        await Promise.all(responses);
        for (const id of ids) {
          // Every object/session remains owned by durable cleanup until its issued URL settles.
          // oxlint-disable-next-line no-await-in-loop -- Revoke each fixture file through its authorized management boundary.
          const result = await setup.request.delete(`${setup.project}/files/${id}`, {
            headers: setup.headers,
          });
          expect([204, 404]).toContain(result.status());
        }
        await appendFile(
          '.turbo/m3-e2e-cleanup.jsonl',
          JSON.stringify({
            organizationId: setup.organizationId,
            projectId: setup.projectId,
            databaseName: test.info().config.metadata['databaseName'],
          }) + '\n',
        );
      } finally {
        await setup.site.close();
        await context.close();
      }
    }
  });
