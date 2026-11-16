import { expect, test } from 'bun:test';

import { storageProviderSettings } from './storage-provider.ts';

const settings = {
  TEST_S3_ENDPOINT: 'https://s3.example.test',
  TEST_S3_BUCKET: 'contract-test',
  TEST_S3_ACCESS_KEY_ID: 'contract-access-id',
  TEST_S3_SECRET_ACCESS_KEY: 'contract-private-secret-do-not-echo',
};
test('an optional provider is absent only when no TEST_S3 setting was supplied', () => {
  expect(storageProviderSettings({})).toBeNull();
  expect(() => storageProviderSettings({ TEST_S3_REGION: 'us-east-1' })).toThrow('explicit');
  try {
    storageProviderSettings({ TEST_S3_SECRET_ACCESS_KEY: settings.TEST_S3_SECRET_ACCESS_KEY });
  } catch (error) {
    expect(String(error)).not.toContain(settings.TEST_S3_SECRET_ACCESS_KEY);
    expect(String(error)).toContain('TEST_S3_BUCKET');
  }
});
test('explicit provider settings reuse validated core storage config and safe errors', () => {
  const result = storageProviderSettings({ ...settings, TEST_S3_FORCE_PATH_STYLE: 'false' });
  expect(result?.config.bucket).toBe('contract-test');
  expect(result?.config.forcePathStyle).toBe(false);
  expect(result?.origin).toBe('http://localhost:5173');
  expect(() =>
    storageProviderSettings({ ...settings, TEST_S3_CORS_ORIGIN: 'https://site.example/path' }),
  ).toThrow('Invalid TEST_S3_CORS_ORIGIN');
});
