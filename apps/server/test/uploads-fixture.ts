import { expect } from 'bun:test';

import { createS3Storage } from '@backbricks/adapters';
import { type TenantTransaction } from '@backbricks/core';
import { createWithTenant } from '@backbricks/db';
import { uploadIntentResponseSchema } from '@backbricks/module-uploads';

import { garageStorageConfig, garageAvailable } from '../../../scripts/test/garage.ts';
import { moduleRepositories } from '../src/module-repositories.ts';
import { moduleCatalog } from '../src/modules.ts';
import { available, type AuthFixture } from './auth-fixture.ts';
import { prepareIsolationFixture } from './isolation/setup.ts';
import { issueKey } from './platform-read-fixture.ts';

export const uploadsAvailable = available && (await garageAvailable());
export const uploadsEnvironment = {
  BACKBRICKS_MODULES: 'uploads',
  SCANNER: 'none',
  S3_ENDPOINT: garageStorageConfig.endpoint,
  S3_REGION: garageStorageConfig.region,
  S3_BUCKET: garageStorageConfig.bucket,
  S3_ACCESS_KEY_ID: garageStorageConfig.accessKeyId,
  S3_SECRET_ACCESS_KEY: garageStorageConfig.secretAccessKey,
  S3_FORCE_PATH_STYLE: 'true',
};
/** Real HTTP/storage/repository fixture, with explicit ownership of every created object key. */
export async function prepareUploads(base: AuthFixture) {
  const f = await prepareIsolationFixture(base);
  const storage = createS3Storage(garageStorageConfig, { now: f.now });
  const scope = { organizationId: f.organizationId, projectId: f.a1.id };
  const withTenant = createWithTenant(f.db, moduleRepositories(moduleCatalog.select(['uploads'])));
  const use = <T>(read: (tx: TenantTransaction) => Promise<T>) => withTenant(scope, read);
  const secret = await issueKey(f, f.a1.id, {
    kind: 'secret',
    name: 'Upload server',
    scopes: ['uploads:create'],
    expiresAt: null,
  });
  const publishable = await issueKey(f, f.a1.id, {
    kind: 'publishable',
    name: 'Upload browser',
    expiresAt: null,
  });
  const headers = { authorization: `Bearer ${secret.token}` };
  const zonePath = `/v1/projects/${f.a1.id}/upload-zones`;
  const zone = await f.request(
    zonePath,
    { key: 'cv', name: 'CV', config: { presets: ['pdf'], maxSizeMb: 1, scanRequired: false } },
    f.owner.cookie,
  );
  expect(zone.status).toBe(201);
  const owned = new Set<string>();
  const intent = async (
    name = 'cv.pdf',
    bytes = new TextEncoder().encode('%PDF-1.7\nfixture\n%%EOF'),
  ) => {
    const response = await f.request(
      '/v1/public/upload-zones/cv/files',
      { data: { name, size: bytes.byteLength, type: 'application/pdf' } },
      undefined,
      headers,
    );
    expect(response.status).toBe(200);
    const result = uploadIntentResponseSchema.parse(await response.json());
    owned.add(`stg/${scope.organizationId}/${scope.projectId}/${result.fileId}`);
    owned.add(`fil/${scope.organizationId}/${scope.projectId}/${result.fileId}`);
    return { ...result, bytes };
  };
  const complete = (file: { fileId: string; uploadToken: string }) =>
    f.request(
      `/v1/public/files/${file.fileId}/complete`,
      { data: { uploadToken: file.uploadToken } },
      undefined,
      headers,
    );
  return {
    ...f,
    storage,
    scope,
    use,
    headers,
    secret,
    publishable,
    zonePath,
    intent,
    complete,
    async put(file: Awaited<ReturnType<typeof intent>>) {
      const response = await fetch(file.uploadUrl, {
        method: 'PUT',
        headers: file.headers,
        body: file.bytes,
      });
      expect(response.status).toBe(200);
    },
    async cleanup() {
      await Promise.all([...owned].map((key) => storage.delete(key)));
      storage.close();
    },
  };
}
