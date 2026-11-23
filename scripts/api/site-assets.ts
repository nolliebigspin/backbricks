import { cp } from 'node:fs/promises';
import { join } from 'node:path';

import { ERROR_CODES } from '@backbricks/core';

import { apiArtifacts, REPOSITORY_ROOT } from './paths.ts';

const site = join(REPOSITORY_ROOT, 'apps/www');
const { contract, configSchema } = apiArtifacts();
await Promise.all([
  Bun.write(join(site, 'public/schema/openapi.json'), Bun.file(contract)),
  Bun.write(join(site, 'public/schema/config.v1.json'), Bun.file(configSchema)),
  Bun.write(join(site, 'src/generated/errors.json'), `${JSON.stringify(ERROR_CODES, null, 2)}\n`),
  cp(join(REPOSITORY_ROOT, 'docs/integration/pages'), join(site, 'src/content/docs/docs'), {
    recursive: true,
  }),
]);
