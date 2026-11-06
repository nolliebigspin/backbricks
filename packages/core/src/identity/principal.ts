import { z } from 'zod';

import { organizationRoleSchema } from '../http/route-policy.ts';
import { isTypeId } from '../ids/type-id.ts';
import { apiKeyRecordSchema } from '../platform/models.ts';

export const sessionIdentitySchema = z
  .object({
    userId: z.string().min(1).max(128),
    emailVerified: z.boolean(),
    activeOrganizationId: z.string().min(1).max(128).nullable(),
  })
  .strict();
export type SessionIdentity = z.infer<typeof sessionIdentitySchema>;
export const secretKeyIdentitySchema = apiKeyRecordSchema
  .pick({ id: true, organizationId: true, projectId: true, scopes: true })
  .extend({
    id: z.string().refine((value) => isTypeId(value, 'key')),
    projectId: z.string().refine((value) => isTypeId(value, 'prj')),
  })
  .strict();
export type SecretKeyIdentity = z.infer<typeof secretKeyIdentitySchema>;
const sessionPrincipalSchema = z
  .object({
    kind: z.literal('session'),
    id: sessionIdentitySchema.shape.userId,
    role: organizationRoleSchema,
  })
  .strict()
  .readonly();
const keyPrincipalSchema = secretKeyIdentitySchema
  .pick({ id: true, scopes: true })
  .extend({
    kind: z.literal('secret_key'),
    scopes: secretKeyIdentitySchema.shape.scopes.readonly(),
  })
  .strict()
  .readonly();
export const principalSchema = z.discriminatedUnion('kind', [
  sessionPrincipalSchema,
  keyPrincipalSchema,
]);
export type Principal = z.infer<typeof principalSchema>;

export type CredentialRequest = { origin: string | null; ipHash?: string; requestId: string };
/** Resolve only active, unexpired credentials; P1.4c supplies lookup and audited exposure rejection. */
export type SecretKeyResolver = (
  credential: string,
  request: CredentialRequest,
) => Promise<SecretKeyIdentity | null>;
