// SPDX-License-Identifier: AGPL-3.0-only

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';

import { command } from './compose-fixture.ts';

const id = z.object({ id: z.string() });
const token = z.object({ token: z.string() });

export async function verifyCliAdministration(input: {
  fixture: { origin: string; directory: string };
  ca: string;
  org: string;
  project: string;
  root: string;
  secret: string;
  cookie: string;
  ownerEmail: string;
  submissionId: string;
  fileId: string;
  reviewId: string;
  content: string;
  request: (path: string, method?: string, body?: unknown) => Promise<Response>;
}) {
  const {
    fixture,
    ca,
    org,
    project,
    root,
    secret,
    cookie,
    ownerEmail,
    submissionId,
    fileId,
    reviewId,
    content,
    request,
  } = input;
  const authDir = join(fixture.directory, 'cli-auth');
  const caPath = join(fixture.directory, 'trusted-ca.pem');
  const sessionDir = join(authDir, 'sessions');
  await mkdir(sessionDir, { recursive: true, mode: 0o700 });
  const sessionName = createHash('sha256').update(fixture.origin).digest('hex');
  await writeFile(join(sessionDir, sessionName), cookie, { mode: 0o600 });
  await writeFile(caPath, ca, { mode: 0o600 });
  const cli = (secretKey: string | undefined, ...args: string[]) =>
    command(
      [
        'node',
        'packages/cli/dist/backbricks.js',
        '--base-url',
        fixture.origin,
        '--json',
        '--yes',
        'admin',
        'run',
        ...args,
      ],
      undefined,
      {
        PATH: process.env['PATH'],
        NODE_EXTRA_CA_CERTS: caPath,
        BACKBRICKS_CONFIG_HOME: authDir,
        BACKBRICKS_SECRET_KEY: secretKey,
      },
    );
  const entryArgs = [
    'forms.submissions.read',
    '--params',
    JSON.stringify({ projectId: project, key: 'application', id: submissionId }),
  ];
  const entryRead = await cli(secret, ...entryArgs);
  if (entryRead.status !== 0 || !entryRead.stdout.includes(ownerEmail))
    throw new Error('The scoped CLI entry read failed.');
  const agent = token.parse(
    await (
      await request(`${root}/keys`, 'POST', {
        kind: 'secret',
        preset: 'agent',
        name: 'Integration preset',
        expiresAt: null,
      })
    ).json(),
  ).token;
  if ((await cli(agent, ...entryArgs)).status !== 3)
    throw new Error('The integration agent preset could read private entries.');
  const sibling = id.parse(
    await (await request('/v1/projects', 'POST', { name: 'Sibling', slug: 'sibling' })).json(),
  ).id;
  const foreign = await cli(
    secret,
    'forms.submissions.read',
    '--params',
    JSON.stringify({ projectId: sibling, key: 'application', id: submissionId }),
  );
  if (foreign.status !== 3 || !foreign.stdout.includes('not_found'))
    throw new Error('A project credential read a sibling project.');
  const out = join(fixture.directory, 'private.pdf');
  const downloaded = await cli(
    secret,
    'uploads.files.download',
    '--params',
    JSON.stringify({ projectId: project, id: fileId }),
    '--out',
    out,
  );
  if (downloaded.status !== 0 || (await readFile(out, 'utf8')) !== content)
    throw new Error('CLI private file download failed.');
  const reviewList = await cli(
    secret,
    'reviews.records.list',
    '--params',
    JSON.stringify({ projectId: project }),
    '--query',
    '{"collection":"testimonials"}',
  );
  if (reviewList.status !== 0 || !reviewList.stdout.includes(reviewId))
    throw new Error('Scoped CLI moderation queue read failed.');
  for (const action of ['unpublish', 'publish']) {
    // oxlint-disable-next-line no-await-in-loop -- Preserve the order of moderation transitions.
    const result = await cli(
      secret,
      'reviews.records.moderate',
      '--params',
      JSON.stringify({ projectId: project, id: reviewId }),
      '--data',
      JSON.stringify({ action }),
    );
    if (result.status !== 0) throw new Error('Scoped CLI review moderation failed.');
  }
  const issuedKeyPath = join(fixture.directory, 'issued-key.json');
  const issued = await cli(
    undefined,
    'createKey',
    '--session',
    '--organization',
    org,
    '--params',
    JSON.stringify({ projectId: project }),
    '--data',
    '{"kind":"secret","scopes":["data:read"],"name":"CLI owner fixture","expiresAt":null}',
    '--out',
    issuedKeyPath,
  );
  if (
    issued.status !== 0 ||
    issued.stdout.includes('bb_sk_') ||
    !token.parse(JSON.parse(await readFile(issuedKeyPath, 'utf8'))).token.startsWith('bb_sk_')
  )
    throw new Error('Dashboard session CLI key creation failed its one-time output contract.');
  const sessionActivity = await cli(
    undefined,
    'listProjectActivity',
    '--session',
    '--organization',
    org,
    '--params',
    JSON.stringify({ projectId: project }),
  );
  if (sessionActivity.status !== 0 || !sessionActivity.stdout.includes('files.downloaded'))
    throw new Error('Dashboard session CLI activity omitted download audit evidence.');
}
