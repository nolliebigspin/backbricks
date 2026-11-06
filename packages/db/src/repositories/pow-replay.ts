import type { ReplayStore } from '@backbricks/core';

import type { Database } from '../client.ts';
import { powChallengesUsed } from '../schema/technical.ts';

/** Global technical signatures carry no tenant data; one atomic insert consumes a verified proof. */
export function createPowReplayStore(db: Pick<Database, 'insert'>): ReplayStore {
  return {
    async claim(digest, expiresAt) {
      const rows = await db
        .insert(powChallengesUsed)
        .values({ signature: digest, expiresAt })
        .onConflictDoNothing()
        .returning({ signature: powChallengesUsed.signature });
      return rows.length === 1;
    },
  };
}
