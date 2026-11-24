// SPDX-License-Identifier: AGPL-3.0-only

import { PutBucketCorsCommand, S3Client } from '@aws-sdk/client-s3';
import { z } from 'zod';

export type GarageSettings = {
  adminUrl: string;
  adminToken: string;
  s3Endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  corsOrigins: string[];
  capacityBytes: number;
};

type AdminResponse = { status: number; body: unknown };

// Only the fields this script reads from the Garage admin API v2.
const clusterLayout = z.object({ version: z.number(), roles: z.array(z.unknown()) });
const clusterStatus = z.object({ nodes: z.array(z.object({ id: z.string() })) });
const bucketInfo = z.object({ id: z.string() });

async function admin(
  settings: GarageSettings,
  path: string,
  body?: unknown,
): Promise<AdminResponse> {
  const response = await fetch(`${settings.adminUrl}/v2/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${settings.adminToken}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

async function expectOk(response: Promise<AdminResponse>, step: string): Promise<unknown> {
  const { status, body } = await response;
  if (status !== 200) throw new Error(`${step} failed (${status})`);
  return body;
}

async function waitForAdminApi(settings: GarageSettings, attempts = 30): Promise<void> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      // oxlint-disable-next-line no-await-in-loop
      if ((await admin(settings, 'GetClusterStatus')).status === 200) return;
    } catch {
      // Garage is still starting.
    }
    // oxlint-disable-next-line no-await-in-loop
    await Bun.sleep(1000);
  }
  throw new Error(`Garage admin API not reachable at ${settings.adminUrl}`);
}

async function ensureLayout(settings: GarageSettings): Promise<string> {
  const layout = clusterLayout.parse(
    await expectOk(admin(settings, 'GetClusterLayout'), 'GetClusterLayout'),
  );
  if (layout.roles.length > 0) return 'layout already assigned';

  const status = clusterStatus.parse(
    await expectOk(admin(settings, 'GetClusterStatus'), 'GetClusterStatus'),
  );
  const node = status.nodes[0];
  if (!node) throw new Error('Garage reports no nodes');
  await expectOk(
    admin(settings, 'UpdateClusterLayout', {
      roles: [{ id: node.id, zone: 'backbricks', capacity: settings.capacityBytes, tags: [] }],
    }),
    'UpdateClusterLayout',
  );
  await expectOk(
    admin(settings, 'ApplyClusterLayout', { version: layout.version + 1 }),
    'ApplyClusterLayout',
  );
  return 'layout assigned';
}

async function ensureBucket(settings: GarageSettings): Promise<string> {
  const existing = await admin(
    settings,
    `GetBucketInfo?globalAlias=${encodeURIComponent(settings.bucket)}`,
  );
  if (existing.status === 200) return bucketInfo.parse(existing.body).id;
  if (existing.status !== 404) throw new Error(`GetBucketInfo failed (${existing.status})`);
  const created = await expectOk(
    admin(settings, 'CreateBucket', { globalAlias: settings.bucket }),
    'CreateBucket',
  );
  return bucketInfo.parse(created).id;
}

async function ensureKey(settings: GarageSettings, bucketId: string): Promise<void> {
  const existing = await admin(
    settings,
    `GetKeyInfo?id=${encodeURIComponent(settings.accessKeyId)}`,
  );
  if (existing.status === 404) {
    await expectOk(
      admin(settings, 'ImportKey', {
        accessKeyId: settings.accessKeyId,
        secretAccessKey: settings.secretAccessKey,
        name: 'backbricks',
      }),
      'ImportKey',
    );
  } else if (existing.status !== 200) {
    throw new Error(`GetKeyInfo failed (${existing.status})`);
  }
  // Granting the same permissions again is a no-op.
  await expectOk(
    admin(settings, 'AllowBucketKey', {
      bucketId,
      accessKeyId: settings.accessKeyId,
      permissions: { read: true, write: true, owner: true },
    }),
    'AllowBucketKey',
  );
}

async function ensureCors(settings: GarageSettings): Promise<void> {
  const s3 = new S3Client({
    endpoint: settings.s3Endpoint,
    region: settings.region,
    forcePathStyle: true,
    credentials: { accessKeyId: settings.accessKeyId, secretAccessKey: settings.secretAccessKey },
  });
  await s3.send(
    new PutBucketCorsCommand({
      Bucket: settings.bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: settings.corsOrigins,
            AllowedMethods: ['PUT', 'GET', 'HEAD'],
            AllowedHeaders: ['*'],
            ExposeHeaders: ['ETag'],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    }),
  );
}

export async function initGarage(settings: GarageSettings): Promise<void> {
  await waitForAdminApi(settings);
  await ensureLayout(settings);
  const bucketId = await ensureBucket(settings);
  await ensureKey(settings, bucketId);
  if (settings.corsOrigins.length > 0) await ensureCors(settings);
}
