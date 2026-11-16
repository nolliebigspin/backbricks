import {
  createSubjectCollection,
  MAX_PAGE_SIZE,
  pageResult,
  repositoryPage,
  type FileAttachment,
} from '@backbricks/core';

import { deleteEntryFiles, listEntryFiles, hasPossibleAttachments } from './attachments.ts';
import type { SubmissionRecord } from './repository.ts';
import { formsRepository, type FormsRuntime } from './runtime.ts';

async function entryAttachments(runtime: FormsRuntime, entry: SubmissionRecord) {
  if (!hasPossibleAttachments(entry.data)) return [];
  const historical = await runtime.instances.revisionById(entry.instanceId, entry.configVersion);
  const fields = historical.config.fields.filter((field) => field.type === 'file');
  if (!fields.length) return [];
  const files = new Map<string, FileAttachment>(
    (await listEntryFiles(runtime, entry.id)).map((file) => [file.id, file]),
  );
  return fields.flatMap((field) => {
    const value = entry.data[field.key];
    if (!Array.isArray(value)) return [];
    return value.map((id) => {
      if (typeof id !== 'string') return { field: field.key, availability: 'missing' };
      const metadata = files.get(id);
      return {
        field: field.key,
        id,
        metadata: metadata ?? null,
        availability: metadata ? 'available' : 'missing',
      };
    });
  });
}
/** Bound the complete subject response while accumulating; never silently truncate the final page. */
export async function exportEntrySubject(runtime: FormsRuntime, email: string) {
  const collection = createSubjectCollection();
  let cursor: string | undefined;
  do {
    const page = pageResult(
      // oxlint-disable-next-line no-await-in-loop -- Ordered pages and operations share scoped frames; parallel work would break their sequence.
      await formsRepository(runtime).findBySubject(
        email,
        repositoryPage({ limit: MAX_PAGE_SIZE, cursor }),
      ),
      MAX_PAGE_SIZE,
    );
    for (const entry of page.data) {
      // oxlint-disable-next-line no-await-in-loop -- Ordered pages and operations share scoped frames; parallel work would break their sequence.
      const attachments = await entryAttachments(runtime, entry);
      collection.add({
        id: entry.id,
        formId: entry.instanceId,
        configVersion: entry.configVersion,
        receivedAt: entry.createdAt.toISOString(),
        updatedAt: entry.updatedAt.toISOString(),
        status: entry.status,
        read: entry.readAt !== null,
        spamVerdict: entry.spamVerdict,
        spamReasons: [...entry.spamReasons],
        isTest: entry.isTest,
        source: entry.source,
        expiresAt: entry.expiresAt?.toISOString() ?? null,
        data: entry.data,
        ...(attachments.length ? { attachments } : {}),
      });
    }
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return { entries: collection.values };
}
/** Erasure batches share one owner transaction, with physical attachment cleanup deferred durably. */
export async function deleteEntrySubject(runtime: FormsRuntime, email: string) {
  let total = 0;
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- Ordered pages and operations share scoped frames; parallel work would break their sequence.
    const rows = await formsRepository(runtime).deleteBySubject(email, MAX_PAGE_SIZE);
    // oxlint-disable-next-line no-await-in-loop -- Ordered pages and operations share scoped frames; parallel work would break their sequence.
    for (const row of rows) await deleteEntryFiles(runtime, row);
    total += rows.length;
    if (rows.length < MAX_PAGE_SIZE) return total;
  }
}
export async function eraseEntryScope(runtime: FormsRuntime, { limit }: { limit: number }) {
  const erased = await formsRepository(runtime).eraseBatch(limit);
  // oxlint-disable-next-line no-await-in-loop -- Ordered pages and operations share scoped frames; parallel work would break their sequence.
  for (const row of erased) await deleteEntryFiles(runtime, row);
  return erased.length;
}
