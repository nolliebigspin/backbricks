import type { JsonValue, RepositoryPage } from '@backbricks/core';

/** Workflow status set by the owner; spam is a separate verdict (D44). */
export type SubmissionStatus = 'open' | 'done';
export type SpamStatus = 'clean' | 'suspect' | 'spam';
/** Minimized request metadata: no raw IP or user agent (I11, docs/modules/forms.md §3). */
export type SubmissionSource = Readonly<{
  origin?: string;
  /** Page path without query or fragment. */
  path?: string;
  uaFamily: string;
  /** Daily-rotating HMAC of the IP (ADR-0025). */
  ipHash?: string;
}>;

export type SubmissionRecord = Readonly<{
  id: string;
  organizationId: string;
  projectId: string;
  instanceId: string;
  configVersion: number;
  data: Readonly<Record<string, JsonValue>>;
  status: SubmissionStatus;
  readAt: Date | null;
  spamVerdict: SpamStatus;
  spamReasons: readonly string[];
  isTest: boolean;
  subjectEmail: string | null;
  source: SubmissionSource;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date | null;
}>;

export type SubmissionInsert = Omit<SubmissionRecord, 'organizationId' | 'projectId'> & {
  /** Text the module extracted for search (text-like answers only, never source/consent). */
  searchText: string;
};
export type SubmissionChanges = Partial<
  Pick<SubmissionRecord, 'status' | 'readAt' | 'spamVerdict' | 'expiresAt'>
> & { updatedAt: Date };
export type SubmissionFilters = Readonly<{
  status?: SubmissionStatus;
  read?: boolean;
  /** `inbox` hides spam; `spam` shows only spam. */
  folder?: 'inbox' | 'spam';
  isTest?: boolean;
  from?: Date;
  to?: Date;
  /** Web-search syntax, matched against the stored search text (D45). */
  query?: string;
}>;
export type SubmissionCounts = Readonly<{ total: number; unread: number; spam: number }>;

/**
 * Forms' repository, implemented in `packages/db` (ADR-0055). Every method is scoped to the
 * transaction's tenant; a foreign or other-form ID behaves as missing. Bulk methods are
 * all-or-nothing: an unknown ID throws `not_found` and the caller's transaction rolls back.
 */
export interface FormsRepository {
  insert(input: SubmissionInsert): Promise<SubmissionRecord>;
  list(
    instanceId: string,
    filters: SubmissionFilters,
    page: RepositoryPage,
  ): Promise<SubmissionRecord[]>;
  get(instanceId: string, id: string, options?: { lock?: boolean }): Promise<SubmissionRecord>;
  patch(instanceId: string, id: string, changes: SubmissionChanges): Promise<SubmissionRecord>;
  delete(instanceId: string, id: string): Promise<void>;
  bulkPatch(
    instanceId: string,
    ids: readonly string[],
    changes: SubmissionChanges,
  ): Promise<number>;
  bulkDelete(instanceId: string, ids: readonly string[]): Promise<number>;
  /** Deletes up to `limit` entries of one form; returns their IDs (delete-all job). */
  deleteBatch(instanceId: string, limit: number): Promise<string[]>;
  counts(instanceId: string): Promise<SubmissionCounts>;
  /** Deletes up to `limit` entries of the project that expired at `now`. */
  purgeExpired(now: Date, limit: number): Promise<number>;
  /**
   * Sets `expires_at` from a new retention: `created_at + days`, or none when unlimited;
   * spam keeps its earlier 30-day cap (§F.4). Returns the number of updated entries.
   */
  recomputeExpiry(instanceId: string, retentionDays: number | null): Promise<number>;
  findBySubject(email: string, page: RepositoryPage): Promise<SubmissionRecord[]>;
  /** Deletes up to `limit` entries of the subject in the project; returns their IDs. */
  deleteBySubject(email: string, limit: number): Promise<string[]>;
  /** Deletes up to `limit` entries of the whole project (project erasure); returns their IDs. */
  eraseBatch(limit: number): Promise<string[]>;
}

declare module '@backbricks/core' {
  interface ModuleRepositories {
    readonly forms: FormsRepository;
  }
}
