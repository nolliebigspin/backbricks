import type { z } from 'zod';

import { AppError } from '../errors/app-error.ts';
import { secretKeyIdentitySchema, type CredentialRequest } from '../identity/principal.ts';
import { publishableKeyTokenSchema, secretKeyTokenSchema } from '../keys/protocol.ts';
import { apiKeyKindSchema } from '../platform/values.ts';

export const publicCredentialSchema = secretKeyIdentitySchema
  .extend({ kind: apiKeyKindSchema })
  .strict();
export type PublicCredential = z.infer<typeof publicCredentialSchema>;
/** Authentication composition owns bootstrap; callers receive only a scoped identity. */
export type PublicCredentialResolver = (
  credential: string,
  request: CredentialRequest,
) => Promise<PublicCredential | null>;

/** Publishable query credentials support HTML forms and authenticated CORS preflight. Secrets stay in headers. */
export function publicRequestCredential(headers: Headers, queryKey?: string) {
  const authorization = headers.get('authorization');
  if (queryKey !== undefined && !publishableKeyTokenSchema.safeParse(queryKey).success)
    throw new AppError('invalid_request');
  if (authorization === null) {
    if (!queryKey) throw new AppError('unauthorized');
    return queryKey;
  }
  const match = /^Bearer ([^ ]+)$/i.exec(authorization);
  const credential = match?.[1];
  if (
    !credential ||
    (!publishableKeyTokenSchema.safeParse(credential).success &&
      !secretKeyTokenSchema.safeParse(credential).success)
  )
    throw new AppError('unauthorized');
  if (queryKey !== undefined && credential !== queryKey) throw new AppError('not_found');
  return credential;
}
