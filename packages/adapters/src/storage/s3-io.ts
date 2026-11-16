import { AppError } from '@backbricks/core';

// Provider stalls must not hold tenant mutations forever; byte streams have their own longer bound.
export const STORAGE_IO_TIMEOUTS = { metadataMs: 5000, readMs: 30_000 } as const;

export function unavailable(): never {
  throw new AppError('service_unavailable', { detail: 'Object storage is unavailable.' });
}
export function isMissing(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    '$metadata' in error &&
    typeof error.$metadata === 'object' &&
    error.$metadata !== null &&
    'httpStatusCode' in error.$metadata &&
    error.$metadata.httpStatusCode === 404
  );
}
