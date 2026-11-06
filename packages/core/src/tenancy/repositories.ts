import type { z } from 'zod';

import type { AuditFilters } from '../platform/activity-fields.ts';
import type {
  ApiKeyRecord,
  AuditEntry,
  EventRecord,
  IdempotencyRecord,
  InstanceRevision,
  ModuleInstance,
  Project,
} from '../platform/models.ts';
import type { instanceUpdateSchema, projectUpdateSchema } from '../platform/models.ts';

/** A bounded page query; API-specific cursors are decoded before entering repositories. */
export type RepositoryPage = {
  limit: number;
  /** Internal look-ahead for determining nextCursor; never a client-provided limit override. */
  lookAhead?: boolean;
  before?: { createdAt: Date; id: string };
};
type ProjectChild<T> = Omit<T, 'organizationId' | 'projectId'>;

export interface ProjectRepository {
  list(page: RepositoryPage): Promise<Project[]>;
  get(id: string, options?: { includeArchived?: boolean; lock?: boolean }): Promise<Project>;
  insert(input: Omit<Project, 'organizationId'>): Promise<Project>;
  update(id: string, input: z.infer<typeof projectUpdateSchema>): Promise<Project>;
}

export interface KeyRepository {
  list(page: RepositoryPage): Promise<ApiKeyRecord[]>;
  get(id: string, options?: { lock?: boolean }): Promise<ApiKeyRecord>;
  findByHash(hash: Uint8Array, now: Date): Promise<ApiKeyRecord | null>;
  publishable(now: Date): Promise<string | null>;
  insert(input: ProjectChild<ApiKeyRecord>): Promise<ApiKeyRecord>;
  revoke(id: string, now: Date): Promise<void>;
  touch(id: string, now: Date, before: Date): Promise<void>;
}

export interface InstanceRepository {
  list(page: RepositoryPage, moduleType?: string): Promise<ModuleInstance[]>;
  get(id: string): Promise<ModuleInstance>;
  getByKey(moduleType: string, key: string): Promise<ModuleInstance>;
  insert(input: ProjectChild<ModuleInstance>): Promise<ModuleInstance>;
  update(
    id: string,
    expectedVersion: number,
    input: z.infer<typeof instanceUpdateSchema>,
  ): Promise<ModuleInstance>;
  delete(id: string): Promise<void>;
}

export interface RevisionRepository {
  list(instanceId: string, page: RepositoryPage): Promise<InstanceRevision[]>;
  get(instanceId: string, version: number): Promise<InstanceRevision>;
  insert(input: ProjectChild<InstanceRevision>): Promise<InstanceRevision>;
}

export interface AuditRepository {
  /** API reads supply validAt; maintenance may inspect expired history before hard purging. */
  list(page: RepositoryPage, filters?: AuditFilters, validAt?: Date): Promise<AuditEntry[]>;
  insert(input: ProjectChild<AuditEntry>): Promise<void>;
}

export interface EventRepository {
  pending(limit: number): Promise<EventRecord[]>;
  insert(input: ProjectChild<EventRecord>): Promise<void>;
  markDispatched(id: string, at: Date): Promise<void>;
}

export interface UsageRepository {
  increment(metric: string, period: string, delta: bigint): Promise<void>;
  list(period: string): Promise<{ metric: string; value: bigint }[]>;
}

export interface IdempotencyRepository {
  get(key: string, now: Date): Promise<IdempotencyRecord | null>;
  insert(input: ProjectChild<IdempotencyRecord>): Promise<boolean>;
}

/** Module packages may augment this map with their repository interfaces, never a DB driver. */
export interface ModuleRepositories {
  readonly [module: string]: unknown;
}

/** Only repositories, not an unrestricted driver, cross the tenant transaction boundary. */
export type TenantRepositories = Readonly<{
  projects: ProjectRepository;
  keys: KeyRepository;
  instances: InstanceRepository;
  revisions: RevisionRepository;
  audit: AuditRepository;
  events: EventRepository;
  usage: UsageRepository;
  idempotency: IdempotencyRepository;
}>;
