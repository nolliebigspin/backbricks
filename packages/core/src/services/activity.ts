import { z } from 'zod';

import { AppError } from '../errors/app-error.ts';
import { organizationRoleSchema } from '../http/route-policy.ts';
import type { Principal } from '../identity/principal.ts';
import type { Ids, TypeId } from '../ids/type-id.ts';
import { API_KEY_PREFIXES } from '../keys/constants.ts';
import { scopeNameSchema } from '../keys/protocol.ts';
import { auditEntrySchema, eventRecordSchema } from '../platform/models.ts';
import type { TenantTransaction } from '../tenancy/tenant-context.ts';
import type { Clock } from '../time/clock.ts';
import { expiresAfterDays } from '../time/retention.ts';

export const AUDIT_RETENTION_DAYS = 365;
export const EVENT_RETENTION_DAYS = 30;
const MAX_METADATA_ITEMS = 100;
const MAX_METADATA_TEXT_LENGTH = 128;

const metadataString = z
  .string()
  .max(MAX_METADATA_TEXT_LENGTH)
  .refine((value) => !value.includes(API_KEY_PREFIXES.secret), {
    error: 'Secret-shaped metadata is not permitted.',
  });
const identifier = metadataString.regex(/^[A-Za-z0-9_.-]+$/);
const tag = identifier.regex(/^[a-z][a-z0-9_-]*(?:\.[a-z0-9_-]+)*$/i);

/** Structural changes only: full configuration values and user content belong in neither log. */
export const activityMetadataSchema = z
  .object({
    instanceId: identifier.optional(),
    changedFields: z
      .array(metadataString.regex(/^[A-Za-z0-9_.[\]-]+$/))
      .max(MAX_METADATA_ITEMS)
      .optional(),
    previousVersion: z.number().int().positive().optional(),
    configVersion: z.number().int().positive().optional(),
    scopes: z.array(scopeNameSchema).max(MAX_METADATA_ITEMS).optional(),
    preset: tag.optional(),
    reason: tag.optional(),
    status: tag.optional(),
    previousRole: organizationRoleSchema.optional(),
    role: organizationRoleSchema.optional(),
    isTest: z.boolean().optional(),
    count: z.number().int().nonnegative().optional(),
  })
  .strict();

export const auditMutationSchema = auditEntrySchema
  .omit({
    id: true,
    organizationId: true,
    projectId: true,
    createdAt: true,
    expiresAt: true,
  })
  .partial({
    actorId: true,
    targetType: true,
    targetId: true,
    changes: true,
    ipHash: true,
    requestId: true,
  })
  .extend({
    action: tag,
    actorId: identifier.nullable().optional(),
    targetType: tag.nullable().optional(),
    targetId: identifier.nullable().optional(),
    requestId: identifier.nullable().optional(),
    ipHash: z
      .instanceof(Uint8Array)
      .refine((value) => value.byteLength === 32)
      .nullable()
      .optional(),
    changes: activityMetadataSchema.nullable().optional(),
  });
export type AuditMutation = z.infer<typeof auditMutationSchema>;

export const eventMutationSchema = eventRecordSchema
  .omit({
    id: true,
    organizationId: true,
    projectId: true,
    createdAt: true,
    expiresAt: true,
    dispatchedAt: true,
  })
  .partial({ subjectType: true, subjectId: true })
  .extend({
    type: tag,
    subjectType: tag.nullable().optional(),
    subjectId: identifier.nullable().optional(),
    payload: activityMetadataSchema.default({}),
  });
export type EventMutation = z.input<typeof eventMutationSchema>;

export interface AuditService {
  record(tx: TenantTransaction, input: AuditMutation): Promise<TypeId<'aud'>>;
}
export interface EventService {
  publish(tx: TenantTransaction, input: EventMutation): Promise<TypeId<'evt'>>;
}

type Dependencies = { clock: Clock; ids: Ids };

/** Audit is part of the supplied tenant transaction; this service never opens a second one. */
export function createAuditService({ clock, ids }: Dependencies): AuditService {
  return {
    async record(tx, input) {
      const result = auditMutationSchema.safeParse(input);
      if (!result.success) throw new AppError('internal_error');
      const data = result.data;
      const now = clock.now();
      const id = ids.generate('aud');
      await tx.repositories.audit.insert({
        id,
        actorType: data.actorType,
        actorId: data.actorId ?? null,
        action: data.action,
        targetType: data.targetType ?? null,
        targetId: data.targetId ?? null,
        changes: data.changes ?? null,
        requestId: data.requestId ?? null,
        ipHash: data.ipHash ?? null,
        createdAt: now,
        expiresAt: expiresAfterDays(now, AUDIT_RETENTION_DAYS),
      });
      return id;
    },
  };
}

/** Persist only metadata in the transactional outbox; delivery is a worker responsibility. */
export function createEventService({ clock, ids }: Dependencies): EventService {
  return {
    async publish(tx, input) {
      const result = eventMutationSchema.safeParse(input);
      if (!result.success) throw new AppError('internal_error');
      const data = result.data;
      const now = clock.now();
      const id = ids.generate('evt');
      await tx.repositories.events.insert({
        id,
        type: data.type,
        subjectType: data.subjectType ?? null,
        subjectId: data.subjectId ?? null,
        payload: data.payload,
        createdAt: now,
        dispatchedAt: null,
        expiresAt: expiresAfterDays(now, EVENT_RETENTION_DAYS),
      });
      return id;
    },
  };
}

/** Minimal attributable actor projection; never copies session/key credential material. */
export function principalActor(principal: Principal): Pick<AuditMutation, 'actorType' | 'actorId'> {
  return { actorType: principal.kind === 'session' ? 'user' : 'api_key', actorId: principal.id };
}
