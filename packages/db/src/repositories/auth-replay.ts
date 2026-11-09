import type { AuthReplayStore } from '@backbricks/core';

import type { DbTransaction } from '../client.ts';
import { authTokenReplays } from '../schema/technical.ts';

/** A conflicting claim is a replay; outer auth rollback releases a failed verification's claim. */
export function createAuthReplayStore(tx: DbTransaction): AuthReplayStore {
  return {
    async claim(digest, expiresAt) {
      const rows = await tx
        .insert(authTokenReplays)
        .values({ digest, expiresAt })
        .onConflictDoNothing()
        .returning({ digest: authTokenReplays.digest });
      return rows.length === 1;
    },
  };
}
