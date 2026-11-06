import { z } from 'zod';

import { API_KEY_PREFIXES } from './constants.ts';
import { apiKeyMetadataSchema } from './metadata.ts';
import { keyPresetSchema, keyScopesSchema } from './scopes.ts';

export const KEY_NAME_MAX_LENGTH = 120;
const fields = {
  name: z
    .string()
    .trim()
    .min(1)
    .max(KEY_NAME_MAX_LENGTH)
    .refine((value) => !value.includes(API_KEY_PREFIXES.secret)),
  expiresAt: z.iso.datetime().nullable(),
};

/** Expiry is an explicit choice (null means non-expiring); secret rights require one explicit grant source. */
export function apiKeyCreateSchema(enabledModules: readonly string[]) {
  const secret = { kind: z.literal('secret'), ...fields };
  return z.union([
    z.object({ kind: z.literal('publishable'), ...fields }).strict(),
    z.object({ ...secret, preset: keyPresetSchema }).strict(),
    z
      .object({
        ...secret,
        scopes: keyScopesSchema(enabledModules).refine((scopes) => scopes.length > 0),
      })
      .strict(),
  ]);
}
export type ApiKeyCreate = z.infer<ReturnType<typeof apiKeyCreateSchema>>;
/** This response is returned only after the creation transaction has committed. */
export const apiKeyCreationResponseSchema = apiKeyMetadataSchema.extend({ token: z.string() });
