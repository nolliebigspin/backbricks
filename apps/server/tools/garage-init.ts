// SPDX-License-Identifier: AGPL-3.0-only

import { initGarage } from '@backbricks/adapters';

import { garageConfig as config } from './garage.config.ts';

if (!config.success) throw new Error('Invalid Garage initialization settings.');
const env = config.data;
try {
  await initGarage({
    adminUrl: env.GARAGE_ADMIN_URL,
    adminToken: env.GARAGE_ADMIN_TOKEN,
    capacityBytes: env.GARAGE_CAPACITY_BYTES,
    s3Endpoint: env.S3_ENDPOINT,
    bucket: env.S3_BUCKET,
    region: env.S3_REGION,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    corsOrigins: env.S3_CORS_ORIGINS?.split(',').filter(Boolean) ?? [],
  });
  process.stdout.write('Private bucket ready.\n');
} catch {
  throw new Error(
    'Garage could not be provisioned. Check the admin endpoint, layout and bucket settings.',
  );
}
