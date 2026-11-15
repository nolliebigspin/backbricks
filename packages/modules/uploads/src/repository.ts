import {
  fileStatusSchema,
  fileScanResultSchema,
  jsonValueSchema,
  type RepositoryPage,
} from '@backbricks/core';
import { z } from 'zod';

const bytes = z.custom<Uint8Array>((value) => value instanceof Uint8Array);

/** Private stored model; HTTP responses must explicitly project fields, never serialize this record. */
export const uploadRecordSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    projectId: z.string(),
    instanceId: z.string(),
    configVersion: z.number().int().positive(),
    status: fileStatusSchema,
    stagingKey: z.string(),
    storageKey: z.string(),
    originalName: z.string(),
    declaredMime: z.string(),
    detectedMime: z.string().nullable(),
    sizeBytes: z.number().int().positive(),
    sha256: bytes.nullable(),
    scan: fileScanResultSchema.nullable(),
    scanAttempts: z.number().int().nonnegative(),
    uploadTokenHash: bytes,
    uploadExpiresAt: z.date(),
    uploadedAt: z.date().nullable(),
    copiedAt: z.date().nullable(),
    stagingCleanedAt: z.date().nullable(),
    storageCleanedAt: z.date().nullable(),
    ownerType: z.string().nullable(),
    ownerId: z.string().nullable(),
    ownerExpiresAt: z.date().nullable(),
    subjectEmail: z.string().nullable(),
    metadata: z.record(z.string(), jsonValueSchema),
    isTest: z.boolean(),
    createdAt: z.date(),
    updatedAt: z.date(),
    expiresAt: z.date().nullable(),
    deletedAt: z.date().nullable(),
    cleanupAfter: z.date().nullable(),
    cleanupAttempts: z.number().int().nonnegative(),
  })
  .strict();
export type UploadRecord = z.infer<typeof uploadRecordSchema>;
export type UploadInsert = Pick<
  UploadRecord,
  | 'id'
  | 'instanceId'
  | 'configVersion'
  | 'stagingKey'
  | 'storageKey'
  | 'originalName'
  | 'declaredMime'
  | 'sizeBytes'
  | 'uploadTokenHash'
  | 'uploadExpiresAt'
  | 'metadata'
  | 'isTest'
  | 'createdAt'
  | 'updatedAt'
  | 'expiresAt'
>;
export type UploadChanges = Partial<
  Pick<
    UploadRecord,
    | 'status'
    | 'detectedMime'
    | 'sha256'
    | 'scan'
    | 'scanAttempts'
    | 'uploadedAt'
    | 'copiedAt'
    | 'stagingCleanedAt'
    | 'storageCleanedAt'
    | 'ownerType'
    | 'ownerId'
    | 'ownerExpiresAt'
    | 'subjectEmail'
    | 'expiresAt'
    | 'deletedAt'
    | 'cleanupAfter'
    | 'cleanupAttempts'
  >
> & { updatedAt: Date };
export type UploadFilters = Readonly<{
  instanceId?: string;
  status?: UploadRecord['status'];
  from?: Date;
  to?: Date;
  query?: string;
}>;
export type UploadOwner = Readonly<{ type: string; id: string }>;
export type UploadReadOptions = Readonly<{ lock?: boolean; includeInactive?: boolean }>;

/** Tenant/project-bound persistence. Inactive reads are for internal cleanup/erasure, never HTTP projections. */
export interface UploadsRepository {
  /** Acquire the bound project's key-share lock before worker/capability file locks (FK lock order). */
  lockProject(options?: { write?: boolean }): Promise<void>;
  insert(input: UploadInsert): Promise<UploadRecord>;
  get(id: string, now: Date, options?: UploadReadOptions): Promise<UploadRecord>;
  /** Optional shared zone lock precedes file locks and serializes policy edits with scans/claims. */
  resolveZoneKey(id: string, now: Date, options?: Pick<UploadReadOptions, 'lock'>): Promise<string>;
  list(filters: UploadFilters, page: RepositoryPage, now: Date): Promise<UploadRecord[]>;
  lockMany(ids: readonly string[], now: Date, options?: UploadReadOptions): Promise<UploadRecord[]>;
  patch(id: string, changes: UploadChanges): Promise<UploadRecord>;
  transition(
    id: string,
    from: readonly UploadRecord['status'][],
    changes: UploadChanges,
  ): Promise<UploadRecord | null>;
  byOwner(owner: UploadOwner, now: Date, options?: UploadReadOptions): Promise<UploadRecord[]>;
  usage(): Promise<{ count: bigint; storedBytes: bigint; reservedBytes: bigint }>;
  removeDeleted(id: string, now: Date): Promise<boolean>;
  findExpired(now: Date, limit: number): Promise<UploadRecord[]>;
  findCleanup(now: Date, limit: number): Promise<UploadRecord[]>;
  findStaging(now: Date, limit: number): Promise<UploadRecord[]>;
  forScope(limit: number): Promise<UploadRecord[]>;
  findBySubject(email: string, page: RepositoryPage): Promise<UploadRecord[]>;
  recomputeExpiry(instanceId: string, retentionDays: number | null): Promise<number>;
}

declare module '@backbricks/core' {
  interface ModuleRepositories {
    readonly uploads: UploadsRepository;
  }
}
