import { test } from 'bun:test';

import { garageAvailable, garageStorageConfig } from '../../../../scripts/test/garage.ts';
import { storageProviderSettings } from '../../../../scripts/test/storage-provider.ts';
import {
  storageSessionContract,
  inflightSessionControl,
  abortedInflightSessionContract,
} from '../../test/storage-session-contract.ts';
import { createS3Storage } from './s3.ts';

const available = await garageAvailable();
async function contract(config: Parameters<typeof createS3Storage>[0]) {
  const storage = createS3Storage(config);
  try {
    await storageSessionContract(storage);
    await inflightSessionControl(storage);
    await abortedInflightSessionContract(storage);
  } finally {
    storage.close();
  }
}
test.skipIf(!available)(
  'Garage closes server-finalized sessions, including bodies spanning expiry and abort',
  () => contract(garageStorageConfig),
  30_000,
);
const provider = storageProviderSettings(process.env);
if (provider)
  test(
    'explicit S3 provider satisfies the same upload-session contract',
    () => contract(provider.config),
    60_000,
  );
