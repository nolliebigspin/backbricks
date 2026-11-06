/**
 * Integration test against the compose Garage (`mise run infra`). Locally it is skipped when
 * Garage isn't running; in CI (`CI=true`) a missing service fails the test.
 */
import { describe, expect, test } from 'bun:test';

import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';

import { garageAvailable, garageTestSettings as settings } from '../test/garage.ts';
import { initGarage } from './garage-init.ts';

const available = await garageAvailable();

describe.skipIf(!available)('garage-init (needs mise run infra)', () => {
  test('is idempotent', async () => {
    await initGarage(settings);
    await initGarage(settings);
  });

  test('the dev key can access the bucket', async () => {
    const s3 = new S3Client({
      endpoint: settings.s3Endpoint,
      region: settings.region,
      forcePathStyle: true,
      credentials: {
        accessKeyId: settings.accessKeyId,
        secretAccessKey: settings.secretAccessKey,
      },
    });
    const head = await s3.send(new HeadBucketCommand({ Bucket: settings.bucket }));
    expect(head.$metadata.httpStatusCode).toBe(200);
  });

  test('browsers from the dashboard origin pass the CORS preflight', async () => {
    const response = await fetch(`${settings.s3Endpoint}/${settings.bucket}/any-key`, {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'PUT' },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
  });
});
