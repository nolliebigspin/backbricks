/** Atomic, digest-only expiring replay claim. A duplicate returns false. */
export interface ReplayStore {
  claim(digest: string, expiresAt: Date): Promise<boolean>;
}
