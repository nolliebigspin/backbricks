import { API_KEY_ALPHABET, API_KEY_PREFIXES, API_KEY_TOKEN_LENGTH } from '../keys/constants.ts';

export const REDACTED = '[redacted]';
// IDs stay visible; credential-bearing fields are masked regardless of their contents.
const SECRET_FIELD = /authorization|cookie|passw(or)?d|secret|token|credential|signature|key$/i;
const SECRET_VALUE = new RegExp(
  `${API_KEY_PREFIXES.secret}[${API_KEY_ALPHABET}]{${API_KEY_TOKEN_LENGTH}}`,
  'g',
);
const MAX_DEPTH = 8;

export function isSecretField(name: string): boolean {
  return SECRET_FIELD.test(name);
}

/** Protocol-derived value masking covers credentials embedded in otherwise harmless text fields. */
export function redactSecretText(value: string): string {
  return value.replace(SECRET_VALUE, REDACTED);
}

/** Bounded copying prevents error serializers, custom toJSON and deep/cyclic data bypassing I4. */
export function redactSecrets(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return redactSecretText(value);
  if (depth > MAX_DEPTH) return REDACTED;
  if (typeof value === 'function') return undefined;
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item, depth + 1));
  if (value instanceof Error)
    return redactFields(
      {
        ...Object.fromEntries(Object.entries(value)),
        type: value.name,
        message: value.message,
        stack: value.stack,
        cause: value.cause,
      },
      depth,
    );
  return redactFields(Object.fromEntries(Object.entries(value)), depth);
}

/** Redacts both names and values before structured logging or problem serialization. */
export function redactFields(object: Record<string, unknown>, depth = 0): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [name, field] of Object.entries(object)) {
    result[redactSecretText(name)] = isSecretField(name)
      ? REDACTED
      : redactSecrets(field, depth + 1);
  }
  return result;
}
