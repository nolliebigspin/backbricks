import { execFile } from 'node:child_process';
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { z } from 'zod';

import { garageTestSettings } from '../scripts/test/garage.ts';
import { allowExampleOrigin, provisionExample } from './example-site.ts';
import { expect, test } from './fixtures.ts';
import { scenarioEnvironment } from './scenario.config.ts';
import { serveStaticBuild } from './static-build.ts';

const exec = promisify(execFile);
const binary = 'node_modules/backbricks/dist/backbricks.js';
const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const astroExample = join(projectRoot, 'examples', 'astro');
const template = new URL('../examples/html/backbricks.config.example.json', import.meta.url);
const configSchema = z.object({ modules: z.record(z.string(), z.unknown()) });
const tokenSchema = z.object({ id: z.string(), token: z.string() });
const listSchema = z.object({ data: z.array(z.object({ id: z.string() }).passthrough()) });
const testAnswers = {
  name: 'Synthetic CLI entry',
  email: 'test@example.invalid',
  message: 'Hello',
  privacy: true,
};

// The role fixture issues temporary bearer credentials. Keep them out of Playwright artifacts.
test.use({ trace: 'off' });

test('Scenario A integrates contact, a private CV and testimonials through the packed CLI', async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(180_000);
  if (!baseURL) throw new Error('Missing dashboard URL.');
  const siteOrigin =
    scenarioEnvironment.origin ?? garageTestSettings.corsOrigins.find((item) => item !== '*');
  if (!siteOrigin) throw new Error('The Astro example requires a Garage CORS origin.');
  const directory = await mkdtemp(join(tmpdir(), 'backbricks-scenario-a-'));
  const output = join(directory, 'site');
  let site: Awaited<ReturnType<typeof serveStaticBuild>> | undefined;
  const visitor = await browser.newContext({ extraHTTPHeaders: {} });
  try {
    const setup = await provisionExample(page, baseURL, 'en');
    await allowExampleOrigin(setup, siteOrigin);
    const create = await setup.request.post(`${setup.project}/keys`, {
      headers: setup.headers,
      data: { kind: 'secret', preset: 'agent', name: 'Scenario A agent', expiresAt: null },
    });
    expect(create.status()).toBe(201);
    const agent = tokenSchema.parse(await create.json());
    await exec(
      'npm',
      [
        'install',
        '--ignore-scripts',
        '--no-audit',
        join(projectRoot, 'dist/clients/backbricks-0.4.0.tgz'),
        join(projectRoot, 'dist/clients/backbricks-sdk-0.4.0.tgz'),
      ],
      { cwd: directory },
    );
    const environment = {
      PATH: scenarioEnvironment.child.PATH,
      HOME: directory,
      BACKBRICKS_CONFIG_HOME: join(directory, 'config'),
      BACKBRICKS_SECRET_KEY: agent.token,
    };
    const cli = async (...args: string[]) => {
      const { stdout } = await exec('node', [binary, ...args, '--json'], {
        cwd: directory,
        env: environment,
      });
      return JSON.parse(stdout) as unknown;
    };
    await cli(
      'init',
      '--base-url',
      baseURL,
      '--project',
      setup.projectId,
      '--framework',
      'astro',
      '--yes',
    );
    const source = configSchema.parse(JSON.parse(await readFile(template, 'utf8')));
    await writeFile(
      join(directory, 'backbricks.config.json'),
      JSON.stringify({ project: setup.projectId, modules: source.modules }),
    );
    expect(await cli('validate')).toMatchObject({ valid: true });
    expect(await cli('diff')).toMatchObject({ destructive: false, changes: expect.any(Array) });
    expect(await cli('push', '--yes')).toMatchObject({ applied: true, localSynced: true });
    const mcp = new Client({ name: 'backbricks-scenario-a', version: '1' });
    try {
      await mcp.connect(
        new StdioClientTransport({
          command: 'node',
          args: [binary, 'mcp'],
          cwd: directory,
          env: { ...environment, PATH: environment.PATH ?? '/usr/bin:/bin' },
        }),
      );
      const result = await mcp.callTool({
        name: 'form_upsert',
        arguments: {
          key: 'mcp--contact',
          name: 'MCP contact',
          config: {
            fields: [{ key: 'message', label: 'Message', type: 'textarea' }],
          },
        },
      });
      expect(result).not.toMatchObject({ isError: true });
    } finally {
      await mcp.close();
    }
    const mcpForm = await setup.request.get(`${setup.project}/forms/mcp--contact`, {
      headers: setup.headers,
    });
    expect(await mcpForm.json()).toMatchObject({ key: 'mcp--contact' });
    const audit = await setup.request.get(`${setup.project}/audit-logs`, {
      headers: setup.headers,
    });
    expect(await audit.json()).toMatchObject({
      data: expect.arrayContaining([
        expect.objectContaining({ actorType: 'mcp', actorId: agent.id }),
      ]),
    });
    await cli('codegen');
    const generated = await readFile(join(directory, 'src/backbricks.gen.ts'), 'utf8');
    expect(generated).toContain('forms/contact');
    expect(generated).toContain('upload-zones/cv');
    expect(generated).toContain('review-collections/testimonials');
    await copyFile(join(astroExample, 'src/integrate.ts'), join(directory, 'src/integrate.ts'));
    await exec(
      join(projectRoot, 'node_modules/.bin/tsc'),
      [
        '--module',
        'preserve',
        '--moduleResolution',
        'bundler',
        '--target',
        'ES2024',
        '--lib',
        'ES2024,DOM,DOM.Iterable',
        '--strict',
        '--skipLibCheck',
        '--noEmit',
        'src/backbricks.gen.ts',
        'src/integrate.ts',
      ],
      { cwd: directory },
    );
    expect(
      await cli('test', 'submit', 'forms/contact', '--data', JSON.stringify(testAnswers)),
    ).toMatchObject({ id: expect.any(String), skippedFileFields: ['cv'] });
    expect(await cli('doctor', '--origin', siteOrigin)).toMatchObject({
      publicSecretScan: 'passed',
    });

    await exec('bun', ['--no-env-file', '--bun', 'astro', 'build', '--outDir', output], {
      cwd: astroExample,
      env: {
        ...scenarioEnvironment.child,
        PUBLIC_BACKBRICKS_URL: `${baseURL}/v1`,
        PUBLIC_BACKBRICKS_KEY: setup.publishableKey,
      },
    });
    site = await serveStaticBuild(output, siteOrigin);
    const example = await visitor.newPage();
    let proofWorkers = 0;
    example.on('worker', () => {
      proofWorkers += 1;
    });
    await example.goto(site.url);
    await example.getByLabel('Name', { exact: true }).fill('Ada');
    await example.getByLabel('Email', { exact: true }).fill('ada@example.invalid');
    await example.getByLabel('Message', { exact: true }).fill('Hello from Scenario A');
    await example.getByLabel('CV (PDF)').setInputFiles({
      name: 'cv.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.7\nSynthetic CV\n%%EOF'),
    });
    await example.getByRole('checkbox').check();
    await example.getByRole('button', { name: 'Send contact form' }).click();
    await expect(example.getByText('Message sent.')).toBeVisible({ timeout: 90_000 });
    expect(proofWorkers).toBeGreaterThan(0);

    await example.getByLabel('Reviewer name').fill('Ada Lovelace');
    await example.getByLabel('Rating').fill('5');
    await example.getByLabel('Review', { exact: true }).fill('A good experience');
    await example.getByRole('button', { name: 'Send review' }).click();
    await expect(example.getByText('Review sent for moderation.')).toBeVisible();

    const entries = await setup.request.get(`${setup.project}/forms/contact/submissions`, {
      headers: setup.headers,
    });
    const rows = listSchema.parse(await entries.json()).data;
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ isTest: true }),
        expect.objectContaining({ isTest: false }),
      ]),
    );
    const live = rows.find((row) => row['isTest'] === false);
    if (!live) throw new Error('Expected an accepted live form entry.');
    const detail = await setup.request.get(
      `${setup.project}/forms/contact/submissions/${live.id}`,
      { headers: setup.headers },
    );
    expect(await detail.json()).toMatchObject({
      attachments: [expect.objectContaining({ name: 'cv.pdf' })],
    });

    const reviews = await setup.request.get(`${setup.project}/reviews?collection=testimonials`, {
      headers: setup.headers,
    });
    const review = listSchema.parse(await reviews.json()).data[0];
    if (!review) throw new Error('Expected a submitted review.');
    for (const action of ['approve', 'publish']) {
      // oxlint-disable-next-line no-await-in-loop -- Publication follows approval.
      const update = await setup.request.patch(`${setup.project}/reviews/${review.id}`, {
        headers: setup.headers,
        data: { action },
      });
      expect(update.status()).toBe(200);
    }
    await example.reload();
    await expect(example.getByText('A good experience')).toBeVisible();
  } finally {
    await visitor.close();
    await site?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
