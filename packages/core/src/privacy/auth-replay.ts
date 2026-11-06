/** Digest-only, expiring email-verification replay claims. Enlist in the auth transaction. */
export interface AuthReplayStore {
  claim(digest: string, expiresAt: Date): Promise<boolean>;
}
