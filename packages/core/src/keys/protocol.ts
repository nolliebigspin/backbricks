import { z } from 'zod';

import { API_KEY_PREFIXES, API_KEY_ALPHABET, API_KEY_TOKEN_LENGTH } from './constants.ts';
export { API_KEY_TOKEN_LENGTH } from './constants.ts';

const tokenCharacters = new RegExp(`^[${API_KEY_ALPHABET}]+$`);
/** Scope syntax is shared by policies, persisted credentials and safe audit metadata. */
export const scopeNameSchema = z
  .string()
  .max(128)
  .regex(/^[a-z][a-z0-9_-]*:[a-z][a-z0-9_-]*$/)
  .refine((value) => !value.includes(API_KEY_PREFIXES.secret));
function matchesKey(value: string, prefix: string): boolean {
  const token = value.slice(prefix.length);
  return (
    value.startsWith(prefix) && token.length === API_KEY_TOKEN_LENGTH && tokenCharacters.test(token)
  );
}
export const secretKeyTokenSchema = z
  .string()
  .refine((value) => matchesKey(value, API_KEY_PREFIXES.secret));
export const publishableKeyTokenSchema = z
  .string()
  .refine((value) => matchesKey(value, API_KEY_PREFIXES.publishable));
