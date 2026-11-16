import { formatConfigIssues, httpOriginSchema, loadConfig } from '@backbricks/core';

/** Optional explicit opt-in; partial configuration fails instead of silently skipping a provider. */
export function storageProviderSettings(env: Record<string, string | undefined>) {
  if (!Object.keys(env).some((name) => name.startsWith('TEST_S3_') && env[name] !== undefined))
    return null;
  const required = [
    'TEST_S3_ENDPOINT',
    'TEST_S3_BUCKET',
    'TEST_S3_ACCESS_KEY_ID',
    'TEST_S3_SECRET_ACCESS_KEY',
  ] as const;
  const missing = required.filter((name) => !env[name]);
  if (missing.length) throw new Error(`Storage contract needs explicit ${missing.join(', ')}.`);
  const result = loadConfig(
    {
      NODE_ENV: 'test',
      BACKBRICKS_MODULES: 'contract',
      DATABASE_URL: 'postgres://unused:unused@localhost/unused',
      PUBLIC_URL: 'http://localhost:3000',
      APP_SECRET: 'storage-contract-storage-contract-00000000',
      S3_ENDPOINT: env['TEST_S3_ENDPOINT'],
      S3_PUBLIC_ENDPOINT: env['TEST_S3_PUBLIC_ENDPOINT'],
      S3_REGION: env['TEST_S3_REGION'] ?? 'us-east-1',
      S3_BUCKET: env['TEST_S3_BUCKET'],
      S3_ACCESS_KEY_ID: env['TEST_S3_ACCESS_KEY_ID'],
      S3_SECRET_ACCESS_KEY: env['TEST_S3_SECRET_ACCESS_KEY'],
      S3_FORCE_PATH_STYLE: env['TEST_S3_FORCE_PATH_STYLE'] ?? 'true',
    },
    { contract: [{ service: 'storage' }] },
  );
  if (!result.ok) throw new Error(formatConfigIssues(result.issues));
  if (!result.config.storage) throw new Error('Storage contract config did not select storage.');
  const origin = httpOriginSchema.safeParse(env['TEST_S3_CORS_ORIGIN'] ?? 'http://localhost:5173');
  if (!origin.success) throw new Error('Invalid TEST_S3_CORS_ORIGIN.');
  return { config: result.config.storage, origin: origin.data };
}
