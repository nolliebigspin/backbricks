import { canonicalJson, formatConfigIssues, jsonValueSchema, loadConfig } from '@backbricks/core';
import { createPublishableKeyLookup, createDatabase } from '@backbricks/db';

import { createApp } from './app.ts';
import { apiDocument } from './http/openapi-document.ts';
import { createServerKeyAuth } from './key-auth.ts';
import { createLogger } from './logger.ts';
import { moduleCatalog } from './modules.ts';
import { createPublicCredentialResolver } from './public-auth.ts';
import { platformRoutes } from './routes/platform.ts';
import { createServerServices } from './services.ts';

/** Register real routes without opening connections or running any HTTP/domain handler. */
export async function exportOpenApi(): Promise<string> {
  const result = loadConfig(
    {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgres://offline:offline@127.0.0.1:1/offline',
      APP_SECRET: 'offline-contract-generation-only-not-a-secret',
      PUBLIC_URL: 'https://api.backbricks.invalid',
      BACKBRICKS_MODULES: Object.keys(moduleCatalog.available).join(','),
      S3_ENDPOINT: 'https://storage.backbricks.invalid',
      S3_REGION: 'offline',
      S3_BUCKET: 'offline',
      S3_ACCESS_KEY_ID: 'offline',
      S3_SECRET_ACCESS_KEY: 'offline',
      SCANNER: 'none',
    },
    moduleCatalog.available,
  );
  if (!result.ok) throw new Error(formatConfigIssues(result.issues));
  const database = createDatabase(result.config.databaseUrl);
  const services = createServerServices(result.config, database.db);
  const log = createLogger('silent');
  const keys = createServerKeyAuth(result.config, database.db, log, services);
  try {
    const resolvePublic = createPublicCredentialResolver({
      clock: services.container.core.clock,
      withTenant: services.withTenant,
      resolveSecret: keys.resolveKey,
      lookupPublishable: createPublishableKeyLookup(database.db),
    });
    const app = createApp(
      {
        log,
        ids: services.container.core.ids,
        modules: services.modules,
        readinessChecks: [],
        dashboardDir: null,
      },
      (api) => platformRoutes(api, services, { resolvePublic }),
    );
    const value = jsonValueSchema.parse(JSON.parse(JSON.stringify(apiDocument(app))));
    return `${JSON.stringify(JSON.parse(canonicalJson(value)), null, 2)}\n`;
  } finally {
    await keys.close();
    await services.close();
    await database.close();
  }
}
