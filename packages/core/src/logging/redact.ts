/**
 * Log redaction (I4, ARCHITECTURE §F.1): any field whose name looks like it holds a secret is
 * masked, at any depth. Name-based on purpose, so new fields are covered without updating a
 * list of paths. IDs (`keyId`, `accessKeyId`) stay visible; they aren't secrets.
 */
export const REDACTED = '[redacted]';

// Ends in "key" covers key, apiKey, secret_key, publishableKey; keyId and accessKeyId don't match.
const SECRET_FIELD = /authorization|cookie|passw(or)?d|secret|token|credential|signature|key$/i;

const MAX_DEPTH = 8;

export function isSecretField(name: string): boolean {
  return SECRET_FIELD.test(name);
}

export function redactSecrets(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item, depth + 1));
  if (value instanceof Error) return value;
  return redactFields(Object.fromEntries(Object.entries(value)), depth);
}

/** Redacts the fields of one record, e.g. a log line's merging object. */
export function redactFields(object: Record<string, unknown>, depth = 0): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [name, field] of Object.entries(object)) {
    result[name] = isSecretField(name) ? REDACTED : redactSecrets(field, depth + 1);
  }
  return result;
}
