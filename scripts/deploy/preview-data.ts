// SPDX-License-Identifier: AGPL-3.0-only

import { createHash } from 'node:crypto';

import { z } from 'zod';

const suffix = '00000000000000000000000001';
const project = `prj_${suffix}`;
const original = 'Entry created before upgrading';
const secret = `bb_sk_${crypto.randomUUID().replaceAll('-', '')}`;
const digest = createHash('sha256').update(secret).digest('hex');
const projectRoot = `/v1/projects/${project}`;

/** Bootstrap a disposable preview project without opening signup or waiting for SMTP. */
export const previewData = `
INSERT INTO "organization" (id, name, slug, created_at)
VALUES ('preview-org', 'Preview', 'preview', now());
INSERT INTO "projects" (id, organization_id, name, slug, created_at, updated_at)
VALUES ('${project}', 'preview-org', 'Preview', 'preview', now(), now());
INSERT INTO "api_keys" (id, organization_id, project_id, kind, name, lookup_hash,
  display_prefix, scopes, created_at)
VALUES ('key_${suffix}', 'preview-org', '${project}', 'secret', 'Preview smoke',
  decode('${digest}', 'hex'), 'bb_sk_preview', ARRAY['config:read','config:write','data:read','forms:submit'], now());
`;

async function request(local: string, path: string, body?: object): Promise<unknown> {
  const response = await fetch(`${local}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const problem = z
      .object({ code: z.string() })
      .safeParse(await response.json().catch(() => null));
    throw new Error(
      `Preview record verification failed for ${path} (${response.status}, ${problem.data?.code ?? 'non-json'}).`,
    );
  }
  return response.json();
}

/** Submit through the published Forms preview so its own validator and revision path run. */
export async function createPreviewEntry(local: string) {
  await request(local, `${projectRoot}/forms`, {
    key: 'legacy',
    name: 'Legacy contact',
    config: { fields: [{ key: 'message', type: 'text', label: 'Message' }] },
  });
  return z
    .object({ id: z.string() })
    .parse(
      await request(local, '/v1/public/forms/legacy/submissions', { data: { message: original } }),
    ).id;
}

export async function verifyPreviewData(local: string, submission: string) {
  const [form, entry, revision] = await Promise.all([
    request(local, `${projectRoot}/forms/legacy`),
    request(local, `${projectRoot}/forms/legacy/submissions/${submission}`),
    request(local, `${projectRoot}/forms/legacy/revisions/1`),
  ]);
  const config = z.object({
    configVersion: z.literal(1),
    config: z.object({ fields: z.array(z.object({ key: z.string() })) }),
  });
  if (
    config.parse(form).config.fields[0]?.key !== 'message' ||
    config.parse(revision).config.fields[0]?.key !== 'message' ||
    !JSON.stringify(entry).includes(original)
  ) {
    throw new Error('The Forms preview data or revision did not survive the upgrade.');
  }
}
