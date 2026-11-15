import { garageDevSettings } from '../dev/garage-settings.ts';

export const garageTestSettings = garageDevSettings(process.env);
/** Same host-facing storage config for adapter and actual-browser contracts. */
export const garageStorageConfig = {
  endpoint: garageTestSettings.s3Endpoint,
  publicEndpoint: garageTestSettings.s3Endpoint,
  region: garageTestSettings.region,
  bucket: garageTestSettings.bucket,
  accessKeyId: garageTestSettings.accessKeyId,
  secretAccessKey: garageTestSettings.secretAccessKey,
  forcePathStyle: true,
};
/** All Garage integration suites use the same live-service gate; CI must never silently skip it. */
export async function garageAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${garageTestSettings.adminUrl}/health`, {
      signal: AbortSignal.timeout(1000),
    });
    if (response.ok) return true;
  } catch {
    /* Service availability is checked before integration tests. */
  }
  if (process.env['CI']) throw new Error('Garage is not running (mise run infra)');
  return false;
}
