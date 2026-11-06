/**
 * Error code catalog (ARCHITECTURE §D.3). Codes are part of the public API contract: add new
 * ones freely, never rename or remove one. Each code has exactly one HTTP status.
 */
export const ERROR_CODES = {
  internal_error: { status: 500, title: 'Internal server error' },
  invalid_request: { status: 400, title: 'Invalid request' },
  conflict: { status: 409, title: 'Conflict' },
  module_not_enabled: { status: 404, title: 'Module is not available' },
  not_found: { status: 404, title: 'Not found' },
  unauthorized: { status: 401, title: 'Authentication required' },
  forbidden: { status: 403, title: 'Access denied' },
  secret_key_exposed: { status: 403, title: 'Secret key exposed' },
  validation_failed: { status: 422, title: 'Validation failed' },
  payload_too_large: { status: 413, title: 'Payload too large' },
  unsupported_media_type: { status: 415, title: 'Unsupported media type' },
  service_unavailable: { status: 503, title: 'Service unavailable' },
  rate_limited: { status: 429, title: 'Too many requests' },
} as const satisfies Record<string, { status: number; title: string }>;

export type ErrorCode = keyof typeof ERROR_CODES;
export type ErrorStatus = (typeof ERROR_CODES)[ErrorCode]['status'];

/** Problem `type` URLs resolve to the error reference on the website (`/errors/<code>`, M5). */
export const ERROR_TYPE_BASE_URL = 'https://backbricks.app/errors/';
