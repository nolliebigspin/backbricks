import { expect, test } from 'bun:test';

import { garageAvailable, garageTestSettings as storage } from '../../../scripts/test/garage.ts';
import { available, scenario } from '../test/auth-fixture.ts';

const storageAvailable = await garageAvailable();
test.skipIf(!available || !storageAvailable)(
  'storage readiness follows selected infrastructure and storage-free boot ignores invalid S3 config',
  async () => {
    await scenario(
      async (f) => {
        expect((await fetch(`${f.origin}/readyz`)).status).toBe(200);
      },
      {
        BACKBRICKS_MODULES: 'uploads',
        S3_ENDPOINT: storage.s3Endpoint,
        S3_PUBLIC_ENDPOINT: 'http://browser.invalid',
        S3_REGION: storage.region,
        S3_BUCKET: storage.bucket,
        S3_ACCESS_KEY_ID: storage.accessKeyId,
        S3_SECRET_ACCESS_KEY: storage.secretAccessKey,
        S3_FORCE_PATH_STYLE: 'true',
      },
    );
    await scenario(
      async (f) => {
        expect((await fetch(`${f.origin}/readyz`)).status).toBe(200);
      },
      { BACKBRICKS_MODULES: 'forms', S3_ENDPOINT: 'invalid', S3_PUBLIC_ENDPOINT: 'invalid' },
    );
  },
);
