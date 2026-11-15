import { MAX_BULK_ITEMS, type ConfiguredInstance } from '@backbricks/core';

import { deleteEntryFiles, syncEntryFileExpiry } from './attachments.ts';
import type { FormsConfig } from './config.ts';
import { formsRepository, type FormsRuntime } from './runtime.ts';

export async function purgeExpiredEntries(
  runtime: FormsRuntime,
  input: { now: Date; limit: number },
) {
  const ids = await formsRepository(runtime).purgeExpired(input.now, input.limit);
  for (const row of ids) {
    // oxlint-disable-next-line no-await-in-loop -- Cleanup shares the owner's erasure transaction.
    await deleteEntryFiles(runtime, row);
  }
  return ids.length;
}

export async function recomputeEntryExpiry(
  runtime: FormsRuntime,
  instance: ConfiguredInstance<FormsConfig>,
) {
  const repository = formsRepository(runtime);
  const count = await repository.recomputeExpiry(instance.id, instance.config.retentionDays);
  let before: { id: string; createdAt: Date } | undefined;
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- Keyset pages bound memory without truncating owner synchronization.
    const page = await repository.ownerExpiryPage(instance.id, { limit: MAX_BULK_ITEMS, before });
    // oxlint-disable-next-line no-await-in-loop -- The same transaction updates all owner and attachment lifetimes.
    await syncEntryFileExpiry(runtime, page);
    if (page.length < MAX_BULK_ITEMS) return count;
    const last = page.at(-1);
    if (!last) return count;
    before = { id: last.id, createdAt: last.createdAt };
  }
}
