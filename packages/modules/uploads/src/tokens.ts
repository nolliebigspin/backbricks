import { timingSafeEqual } from 'node:crypto';

import { AppError, hashApiKey, UPLOAD_TOKEN_PREFIX, UPLOAD_TOKEN_BYTES } from '@backbricks/core';

/** Generate 256 random bits; only its SHA-256 digest is persisted. */
export function createUploadToken(): string {
  return `${UPLOAD_TOKEN_PREFIX}${Buffer.from(crypto.getRandomValues(new Uint8Array(UPLOAD_TOKEN_BYTES))).toString('hex')}`;
}
/** Unknown files and incorrect tokens have the same not-found behavior. */
export async function verifyUploadToken(hash: Uint8Array, token: string): Promise<void> {
  const expected = await hashApiKey(token);
  if (hash.byteLength !== expected.byteLength || !timingSafeEqual(hash, expected))
    throw new AppError('not_found');
}
