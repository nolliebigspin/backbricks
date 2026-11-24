// SPDX-License-Identifier: AGPL-3.0-only

import { randomBytes } from 'node:crypto';

import { z } from 'zod';

import { createClient } from '../../packages/sdk/src/index.ts';
import { deployment, run } from './compose-fixture.ts';
import { createPreviewEntry, previewData, verifyPreviewData } from './preview-data.ts';
import { verifyCliAdministration } from './scenario-c-admin.ts';

const image = process.argv[2] ?? 'backbricks/server:p6-candidate';
const id = z.object({ id: z.string() });
const token = z.object({ token: z.string() });
const baseline = process.argv
  .find((arg) => arg.startsWith('--baseline='))
  ?.slice('--baseline='.length);
const scan = !process.argv.includes('--no-scan');
const owner = {
  name: 'Scenario C Owner',
  email: 'owner@example.invalid',
  password: randomBytes(24).toString('hex'),
};
const fixture = await deployment(image, 'forms,uploads,reviews', true, scan);

function connection(ca: string) {
  const transport = (input: Request | URL | string, init?: RequestInit) =>
    fetch(input, { ...init, tls: { ca } });
  let cookie = '';
  let org = '';
  async function request(path: string, method = 'GET', body?: unknown) {
    const response = await transport(`${fixture.origin}${path}`, {
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: {
        origin: fixture.origin,
        'x-backbricks-csrf': '1',
        'content-type': 'application/json',
        ...(cookie && { cookie }),
        ...(org && { 'x-backbricks-organization-id': org }),
      },
      redirect: 'error',
    });
    if (!response.ok) throw new Error(`${method} ${path} returned ${response.status}`);
    return response;
  }
  return {
    transport,
    request,
    async login() {
      const response = await request('/api/auth/sign-in/email', 'POST', {
        email: owner.email,
        password: owner.password,
        rememberMe: false,
      });
      cookie =
        response.headers
          .getSetCookie()
          .find((value) => value.includes('session_token='))
          ?.split(';')[0] ?? '';
      if (!cookie) throw new Error('Expected the dashboard session cookie.');
    },
    sessionCookie() {
      return cookie;
    },
    select(organization: string) {
      org = organization;
    },
  };
}

try {
  await fixture.compose(['up', '-d', '--wait']);
  const setup = ['run', '--rm', '--no-deps', '-T', 'setup'];
  const attempts = await Promise.all([
    fixture.command(setup, JSON.stringify(owner)),
    fixture.command(setup, JSON.stringify(owner)),
  ]);
  if (
    attempts
      .map((attempt) => attempt.status)
      .toSorted((a, b) => a - b)
      .join(',') !== '0,1'
  )
    throw new Error('Operator setup must succeed once across concurrent requests.');
  const ca = await fixture.compose([
    'exec',
    '-T',
    'caddy',
    'cat',
    '/data/caddy/pki/authorities/local/root.crt',
  ]);
  const app = connection(ca);
  const ready = await app.request('/readyz');
  if (!ready.headers.has('strict-transport-security'))
    throw new Error('Missing TLS response policy.');
  const dashboard = await app.request('/');
  if (!dashboard.headers.get('content-security-policy')?.includes("frame-ancestors 'none'"))
    throw new Error('Missing dashboard content policy.');
  if (!(await dashboard.text()).includes('<div id="root">'))
    throw new Error('Production dashboard missing.');
  await app.login();
  const org = id.parse(
    await (
      await app.request('/api/auth/organization/create', 'POST', {
        name: 'Scenario C',
        slug: 'scenario-c',
      })
    ).json(),
  ).id;
  app.select(org);
  const project = id.parse(
    await (
      await app.request('/v1/projects', 'POST', {
        name: 'Scenario C',
        slug: 'scenario-c',
      })
    ).json(),
  ).id;
  const root = `/v1/projects/${project}`;
  const secret = token.parse(
    await (
      await app.request(`${root}/keys`, 'POST', {
        kind: 'secret',
        scopes: ['forms:submit', 'uploads:create', 'reviews:submit', 'data:read', 'data:write'],
        name: 'Scenario C',
        expiresAt: null,
      })
    ).json(),
  ).token;
  const publishable = token.parse(
    await (
      await app.request(`${root}/keys`, 'POST', {
        kind: 'publishable',
        name: 'Scenario C public',
        expiresAt: null,
      })
    ).json(),
  ).token;
  await app.request(`${root}/upload-zones`, 'POST', {
    key: 'cv',
    name: 'CV',
    config: { scanRequired: scan, presets: ['pdf'] },
  });
  await app.request(`${root}/forms`, 'POST', {
    key: 'application',
    name: 'Application',
    config: {
      fields: [
        { key: 'email', label: 'Email', type: 'email', required: true },
        { key: 'cv', label: 'CV', type: 'file', required: true, zone: 'cv' },
      ],
    },
  });
  await app.request(`${root}/review-collections`, 'POST', {
    key: 'testimonials',
    name: 'Testimonials',
    config: {},
  });
  const client = createClient({ baseUrl: fixture.origin, secretKey: secret, fetch: app.transport });
  const content = `%PDF-1.4\n1 0 obj\n<<>>\nendobj\n${' '.repeat(2 * 1024 * 1024)}\n%%EOF\n`;
  const upload = await client.uploads.upload(
    'cv',
    new File([content], 'application.pdf', { type: 'application/pdf' }),
  );
  const submission = id.parse(
    await client.forms.submit('application', { email: owner.email, cv: [upload.fileRef] }),
  );
  const review = id.parse(
    await client.reviews.submit('testimonials', { rating: 5, authorName: 'Visitor' }),
  );
  await app.request(`${root}/reviews/${review.id}`, 'PATCH', { action: 'approve' });
  await app.request(`${root}/reviews/${review.id}`, 'PATCH', { action: 'publish' });

  async function verifyRecovered(active: ReturnType<typeof connection>) {
    const entry = await (
      await active.request(`${root}/forms/application/submissions/${submission.id}`)
    ).json();
    if (!JSON.stringify(entry).includes(owner.email))
      throw new Error('Expected the verified form entry.');
    const link = z
      .object({ url: z.url() })
      .parse(
        await (
          await active.request(`${root}/files/${upload.fileId}/download-url`, 'POST', {})
        ).json(),
      );
    const file = await active.transport(link.url);
    if (
      !file.headers.get('content-disposition')?.startsWith('attachment;') ||
      file.headers.get('content-type') !== 'application/octet-stream' ||
      !file.headers.get('cache-control')?.includes('no-store')
    )
      throw new Error('Private download did not enforce attachment policy.');
    const invalid = new URL(link.url);
    invalid.searchParams.set('ticket', 'invalid');
    if ((await active.transport(invalid)).status !== 404)
      throw new Error('Invalid storage capability was accepted.');
    if (!file.ok || (await file.text()) !== content)
      throw new Error('Expected identical private file bytes.');
    const publicClient = createClient({
      baseUrl: fixture.origin,
      publishableKey: publishable,
      fetch: active.transport,
    });
    const publicReviews = await publicClient.reviews.list('testimonials');
    if (publicReviews.data[0]?.rating !== 5) throw new Error('Expected the published review.');
  }
  await verifyRecovered(app);
  await verifyCliAdministration({
    fixture,
    ca,
    org,
    project,
    root,
    secret,
    cookie: app.sessionCookie(),
    ownerEmail: owner.email,
    submissionId: submission.id,
    fileId: upload.fileId,
    reviewId: review.id,
    content,
    request: app.request,
  });
  await fixture.compose(['stop', 'caddy', 'app', 'garage']);
  await fixture.compose(['run', '--rm', 'backup', 'init']);
  await fixture.compose(['run', '--rm', 'backup', 'backup']);
  const snapshots = z
    .array(z.object({ id: z.string() }))
    .parse(JSON.parse(await fixture.compose(['run', '--rm', 'backup', 'snapshots', '--json'])));
  const snapshot = snapshots.at(-1);
  if (!snapshot) throw new Error('Backup snapshot unavailable.');
  await fixture.compose(['down', '-v']);
  await fixture.restore(['up', '-d', '--wait', 'postgres']);
  await fixture.restore(['run', '--rm', 'backup', 'restore', snapshot.id]);
  await fixture.restore(['up', '-d', '--wait']);
  const recovered = connection(
    await fixture.restore([
      'exec',
      '-T',
      'caddy',
      'cat',
      '/data/caddy/pki/authorities/local/root.crt',
    ]),
  );
  await recovered.login();
  recovered.select(org);
  await verifyRecovered(recovered);
  process.stdout.write(
    'Scenario C passed production TLS, first-owner bootstrap, proxy uploads, forms, reviews and encrypted restore.\n',
  );
} finally {
  await fixture.cleanup();
}

for (const modules of ['forms', 'uploads']) {
  // oxlint-disable-next-line no-await-in-loop -- Both fixtures use the default private subnet and run sequentially.
  await verifySubset(modules);
}

async function verifySubset(modules: string) {
  const app = await deployment(image, modules, false);
  try {
    let previewEntry: string | undefined;
    if (modules === 'forms' && baseline) {
      await app.setImage(baseline);
      await app.compose(['up', '-d', '--wait']);
      await app.compose(
        [
          'exec',
          '-T',
          'postgres',
          'psql',
          '-U',
          'backbricks',
          '-d',
          'backbricks',
          '-v',
          'ON_ERROR_STOP=1',
        ],
        previewData,
      );
      previewEntry = await createPreviewEntry(app.local);
      await app.compose(['stop', 'app']);
      await app.setImage(image);
    }
    await app.compose(['up', '-d', '--wait']);
    if (previewEntry) {
      await verifyPreviewData(app.local, previewEntry);
      process.stdout.write(
        'Scenario C verified a Forms preview entry and configuration revision after migration.\n',
      );
    }
    const available = z
      .object({ modules: z.array(z.object({ type: z.string(), operational: z.boolean() })) })
      .parse(await (await fetch(`${app.local}/v1/meta`)).json())
      .modules.filter((item) => item.operational)
      .map((item) => item.type);
    if (available.join(',') !== modules) throw new Error('Unexpected production module selection.');
    const running = (await app.compose(['ps', '--services', '--status', 'running']))
      .trim()
      .split('\n')
      .toSorted();
    const expected = modules === 'forms' ? ['app', 'postgres'] : ['app', 'garage', 'postgres'];
    if (running.join(',') !== expected.join(','))
      throw new Error('Unexpected production services.');
    const container = (await app.compose(['ps', '-q', 'app'])).trim();
    if (
      (
        await run(['docker', 'inspect', container, '--format', '{{.HostConfig.ReadonlyRootfs}}'])
      ).trim() !== 'true'
    )
      throw new Error('Production app filesystem must be read-only.');
    if ((await app.compose(['exec', '-T', 'app', 'id', '-u'])).trim() === '0')
      throw new Error('Production app must run as a non-root user.');
    process.stdout.write(`Scenario C verified the ${modules} deployment footprint.\n`);
  } finally {
    await app.cleanup();
  }
}
