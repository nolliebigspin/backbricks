// SPDX-License-Identifier: AGPL-3.0-only

import { eq, sql } from 'drizzle-orm';

import type { Database, DbTransaction } from '../client.ts';
import { user } from '../schema/auth.generated.ts';
import { systemSettings } from '../schema/technical.ts';

const setupKey = 'instance.first_owner';

/** Single-use database bootstrap, restricted to the operator's setup process. */
export async function completeInstanceSetup(
  db: Database,
  now: Date,
  createUser: (tx: DbTransaction) => Promise<unknown>,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${setupKey}))`);
    const [setting] = await tx
      .select({ key: systemSettings.key })
      .from(systemSettings)
      .where(eq(systemSettings.key, setupKey));
    const [existing] = await tx.select({ id: user.id }).from(user).limit(1);
    if (setting || existing) return false;
    await createUser(tx);
    await tx.insert(systemSettings).values({ key: setupKey, value: true, updatedAt: now });
    return true;
  });
}
