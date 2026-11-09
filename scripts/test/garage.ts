import { garageDevSettings } from '../dev/garage-settings.ts';

export const garageTestSettings = garageDevSettings(process.env);
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
