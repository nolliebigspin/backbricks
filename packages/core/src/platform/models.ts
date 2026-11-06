import { z } from 'zod';

import { scopeNameSchema } from '../keys/protocol.ts';
import { actorTypeSchema, apiKeyKindSchema, moduleInstanceStatusSchema } from './values.ts';

const identity = { organizationId: z.string().min(1), projectId: z.string().min(1) };
const timestamps = { createdAt: z.date(), updatedAt: z.date() };

/** Internal project model; wire serializers separately select public fields and ISO dates. */
export const projectSchema = z
  .object({
    id: z.string(),
    organizationId: identity.organizationId,
    name: z.string(),
    slug: z.string(),
    allowedOrigins: z.array(z.string()),
    settings: z.record(z.string(), z.unknown()),
    ...timestamps,
    deletedAt: z.date().nullable(),
  })
  .strict();
export type Project = z.infer<typeof projectSchema>;
export const projectUpdateSchema = projectSchema
  .pick({
    name: true,
    slug: true,
    allowedOrigins: true,
    settings: true,
    updatedAt: true,
    deletedAt: true,
  })
  .partial();

/** Internal credential metadata. This is never a public response schema. */
export const apiKeyRecordSchema = z
  .object({
    id: z.string(),
    ...identity,
    kind: apiKeyKindSchema,
    name: z.string(),
    lookupHash: z.instanceof(Uint8Array),
    displayPrefix: z.string(),
    publicToken: z.string().nullable(),
    scopes: z.array(scopeNameSchema),
    createdBy: z.string().nullable(),
    lastUsedAt: z.date().nullable(),
    expiresAt: z.date().nullable(),
    revokedAt: z.date().nullable(),
    createdAt: z.date(),
  })
  .strict();
export type ApiKeyRecord = z.infer<typeof apiKeyRecordSchema>;

/** Module configuration is validated by its registry definition before repository writes. */
export const moduleInstanceSchema = z
  .object({
    id: z.string(),
    ...identity,
    moduleType: z.string(),
    key: z.string(),
    name: z.string(),
    status: moduleInstanceStatusSchema,
    config: z.unknown(),
    configVersion: z.number().int().positive(),
    moduleVersion: z.number().int().positive(),
    ...timestamps,
  })
  .strict();
export type ModuleInstance = z.infer<typeof moduleInstanceSchema>;
export const instanceUpdateSchema = moduleInstanceSchema
  .pick({
    name: true,
    status: true,
    config: true,
    configVersion: true,
    moduleVersion: true,
    updatedAt: true,
  })
  .partial();

export const instanceRevisionSchema = z
  .object({
    id: z.string(),
    ...identity,
    instanceId: z.string(),
    configVersion: z.number().int().positive(),
    moduleVersion: z.number().int().positive(),
    config: z.unknown(),
    actorType: actorTypeSchema,
    actorId: z.string().nullable(),
    createdAt: z.date(),
  })
  .strict();
export type InstanceRevision = z.infer<typeof instanceRevisionSchema>;

export const auditEntrySchema = z
  .object({
    id: z.string(),
    organizationId: identity.organizationId,
    projectId: identity.projectId.nullable(),
    actorType: actorTypeSchema,
    actorId: z.string().nullable(),
    action: z.string(),
    targetType: z.string().nullable(),
    targetId: z.string().nullable(),
    changes: z.record(z.string(), z.unknown()).nullable(),
    ipHash: z.instanceof(Uint8Array).nullable(),
    requestId: z.string().nullable(),
    createdAt: z.date(),
    expiresAt: z.date(),
  })
  .strict();
export type AuditEntry = z.infer<typeof auditEntrySchema>;

export const eventRecordSchema = z
  .object({
    id: z.string(),
    organizationId: identity.organizationId,
    projectId: identity.projectId.nullable(),
    type: z.string(),
    subjectType: z.string().nullable(),
    subjectId: z.string().nullable(),
    payload: z.record(z.string(), z.unknown()),
    createdAt: z.date(),
    dispatchedAt: z.date().nullable(),
    expiresAt: z.date(),
  })
  .strict();
export type EventRecord = z.infer<typeof eventRecordSchema>;

export const idempotencyRecordSchema = z
  .object({
    ...identity,
    key: z.string(),
    requestHash: z.instanceof(Uint8Array),
    responseStatus: z.number().int(),
    responseBody: z.unknown(),
    createdAt: z.date(),
    expiresAt: z.date(),
  })
  .strict();
export type IdempotencyRecord = z.infer<typeof idempotencyRecordSchema>;
