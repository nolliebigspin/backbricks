import { createClamavScanner } from '@backbricks/adapters';

/** Host-side test connection follows compose's published port; application code uses validated config. */
export const clamavTestConfig = {
  kind: 'clamav' as const,
  host: process.env['TEST_CLAMAV_HOST'] ?? '127.0.0.1',
  port: Number(process.env['CLAMAV_PORT'] ?? 3310),
};
export const EICAR_TEST_BYTES = new TextEncoder().encode(
  'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*',
);
/** CI requires the real optional scanner fixture; missing services never count as passing evidence. */
export async function clamavAvailable(): Promise<boolean> {
  try {
    await createClamavScanner(clamavTestConfig, { timeoutMs: 1000 }).check();
    return true;
  } catch {
    if (process.env['CI']) throw new Error('ClamAV is not running (mise run scan)');
    return false;
  }
}
