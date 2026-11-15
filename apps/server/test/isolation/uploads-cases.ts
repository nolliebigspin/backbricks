import { expect } from 'bun:test';

import { uploadIntentResponseSchema } from '@backbricks/module-uploads';

import { issueKey } from '../platform-read-fixture.ts';
import type { prepareUploads } from '../uploads-fixture.ts';
import type { Cases } from './suite.ts';

/** Create a real pending intent in another fixture project; no object bytes are written implicitly. */
export async function createProjectUploadIntent(
  f: Awaited<ReturnType<typeof prepareUploads>>,
  project: typeof f.a1,
  owner: typeof f.owner,
  size = 21,
) {
  expect(
    (
      await f.request(
        `/v1/projects/${project.id}/upload-zones`,
        { key: 'cv', name: 'CV', config: { presets: ['pdf'], scanRequired: false } },
        owner.cookie,
      )
    ).status,
  ).toBe(201);
  const credential = await issueKey({ ...f, owner }, project.id, {
    kind: 'secret',
    name: 'Upload fixture',
    scopes: ['uploads:create'],
    expiresAt: null,
  });
  const response = await f.request(
    '/v1/public/upload-zones/cv/files',
    { data: { name: 'private.pdf', type: 'application/pdf', size } },
    undefined,
    { authorization: `Bearer ${credential.token}` },
  );
  expect(response.status).toBe(200);
  const result = uploadIntentResponseSchema.parse(await response.json());
  await f.trackIntent(result, { organizationId: project.organizationId, projectId: project.id });
  return {
    ...result,
    complete: () =>
      f.request(
        `/v1/public/files/${result.fileId}/complete`,
        { data: { uploadToken: result.uploadToken } },
        undefined,
        { authorization: `Bearer ${credential.token}` },
      ),
  };
}

/** Actual private rows in sibling projects and a foreign organization, with session-issued credentials. */
export async function uploadsIsolationCases(
  f: Awaited<ReturnType<typeof prepareUploads>>,
): Promise<Cases> {
  const own = await f.ready();
  const sibling = await createProjectUploadIntent(f, f.a2, f.owner);
  const foreign = await createProjectUploadIntent(f, f.b1, f.other);
  const bulk = [await f.intent('bulk-a.pdf'), await f.intent('bulk-b.pdf')];
  const root = `/v1/projects/${f.a1.id}`;
  return {
    'uploads.files.list': {
      kind: 'collection',
      read: { path: `${root}/files`, cookie: f.member.cookie },
      present: [own.fileId],
      absent: [sibling.fileId, foreign.fileId],
      foreign: { path: `/v1/projects/${f.b1.id}/files`, cookie: f.owner.cookie },
    },
    'uploads.files.read': {
      kind: 'resource',
      own: { path: `${root}/files/${own.fileId}`, cookie: f.member.cookie },
      foreign: { path: `${root}/files/${foreign.fileId}`, cookie: f.owner.cookie },
    },
    'uploads.files.download': {
      kind: 'mutation',
      denied: [
        {
          request: {
            path: `${root}/files/${foreign.fileId}/download-url`,
            body: {},
            cookie: f.member.cookie,
          },
          status: 404,
        },
      ],
      allowed: {
        path: `${root}/files/${own.fileId}/download-url`,
        body: {},
        cookie: f.member.cookie,
      },
    },
    'uploads.files.delete': {
      kind: 'mutation',
      successStatus: 204,
      denied: [
        {
          request: {
            path: `${root}/files/${foreign.fileId}`,
            method: 'DELETE',
            cookie: f.member.cookie,
          },
          status: 404,
        },
      ],
      allowed: { path: `${root}/files/${own.fileId}`, method: 'DELETE', cookie: f.member.cookie },
    },
    'uploads.files.bulk_delete': {
      kind: 'mutation',
      denied: [
        {
          request: {
            path: `${root}/files/bulk-delete`,
            body: { ids: bulk.map((file) => file.fileId) },
            cookie: f.member.cookie,
          },
          status: 403,
        },
        {
          request: {
            path: `${root}/files/bulk-delete`,
            body: { ids: [bulk[0]!.fileId, foreign.fileId] },
            cookie: f.admin.cookie,
          },
          status: 404,
        },
      ],
      allowed: {
        path: `${root}/files/bulk-delete`,
        body: { ids: bulk.map((file) => file.fileId) },
        cookie: f.admin.cookie,
      },
    },
    'uploads.storage.usage': {
      kind: 'resource',
      own: { path: `${root}/storage-usage`, cookie: f.member.cookie },
      foreign: { path: `/v1/projects/${f.b1.id}/storage-usage`, cookie: f.owner.cookie },
    },
  };
}
