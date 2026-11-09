import { z } from 'zod';

import { apiKeyRecordSchema, type ApiKeyRecord } from '../platform/models.ts';

/** Management metadata never includes a lookup hash or a redisplayed secret credential. */
export const apiKeyMetadataSchema = apiKeyRecordSchema
  .omit({
    organizationId: true,
    projectId: true,
    lookupHash: true,
    createdBy: true,
  })
  .extend({
    createdAt: z.iso.datetime(),
    lastUsedAt: z.iso.datetime().nullable(),
    expiresAt: z.iso.datetime().nullable(),
    revokedAt: z.iso.datetime().nullable(),
  });

/** Explicit projection also suppresses a corrupt secret row's accidental public-token value. */
export function apiKeyMetadata(key: ApiKeyRecord): z.infer<typeof apiKeyMetadataSchema> {
  return apiKeyMetadataSchema.parse({
    id: key.id,
    kind: key.kind,
    name: key.name,
    displayPrefix: key.displayPrefix,
    publicToken: key.kind === 'publishable' ? key.publicToken : null,
    scopes: key.scopes,
    createdAt: key.createdAt.toISOString(),
    lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
    expiresAt: key.expiresAt?.toISOString() ?? null,
    revokedAt: key.revokedAt?.toISOString() ?? null,
  });
}
