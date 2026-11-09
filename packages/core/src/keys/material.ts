import type { z } from 'zod';

import type { ApiKeyRecord } from '../platform/models.ts';
import type { apiKeyKindSchema } from '../platform/values.ts';
import { API_KEY_PREFIXES, API_KEY_ALPHABET, API_KEY_TOKEN_LENGTH } from './constants.ts';

export const API_KEY_DISPLAY_TOKEN_LENGTH = 8;
const RANDOM_BYTE_RANGE = 256;
const UNBIASED_BYTE_BOUND =
  Math.floor(RANDOM_BYTE_RANGE / API_KEY_ALPHABET.length) * API_KEY_ALPHABET.length;
type RandomFill = (bytes: Uint8Array) => void;
const secureRandom: RandomFill = (bytes) => {
  crypto.getRandomValues(bytes);
};

/** Rejection sampling gives each base62 symbol exactly four accepted byte values. */
export function generateApiKey(
  kind: z.infer<typeof apiKeyKindSchema>,
  random: RandomFill = secureRandom,
): string {
  let token = '';
  const bytes = new Uint8Array(API_KEY_TOKEN_LENGTH);
  while (token.length < API_KEY_TOKEN_LENGTH) {
    random(bytes);
    for (const byte of bytes) {
      if (byte >= UNBIASED_BYTE_BOUND) continue;
      token += API_KEY_ALPHABET.charAt(byte % API_KEY_ALPHABET.length);
      if (token.length === API_KEY_TOKEN_LENGTH) break;
    }
  }
  return `${API_KEY_PREFIXES[kind]}${token}`;
}

/** High-entropy keys use SHA-256; plaintext never belongs in a persistent secret-key row. */
export async function hashApiKey(credential: string): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(credential)),
  );
}

/** Creation-only material: only `stored` may enter persistence; `credential` is the one-time reveal. */
export async function createApiKeyMaterial(
  kind: z.infer<typeof apiKeyKindSchema>,
  random?: RandomFill,
) {
  const credential = generateApiKey(kind, random);
  const stored = {
    kind,
    lookupHash: await hashApiKey(credential),
    displayPrefix: credential.slice(
      0,
      API_KEY_PREFIXES[kind].length + API_KEY_DISPLAY_TOKEN_LENGTH,
    ),
    publicToken: kind === 'publishable' ? credential : null,
  } satisfies Pick<ApiKeyRecord, 'kind' | 'lookupHash' | 'displayPrefix' | 'publicToken'>;
  return { credential, stored };
}

/** Expiry is exclusive: the key is already invalid at its exact expiration time. */
export function isApiKeyActive(
  key: Pick<ApiKeyRecord, 'revokedAt' | 'expiresAt'>,
  now: Date,
): boolean {
  return (
    key.revokedAt === null && (key.expiresAt === null || key.expiresAt.getTime() > now.getTime())
  );
}
