import {
  createSubjectCollection,
  earliestExpiry,
  expiresAfterDays,
  MAX_PAGE_SIZE,
  pageResult,
  repositoryPage,
  SPAM_RETENTION_DAYS,
} from '@backbricks/core';

import type { ReviewsConfig } from './config.ts';
import type { ReviewRecord } from './repository.ts';
import { reviewsRepository, type ReviewsRuntime } from './runtime.ts';

export function reviewExpiry(config: ReviewsConfig, now: Date, spam: ReviewRecord['spamVerdict']) {
  const retention =
    config.retentionDays === null ? null : expiresAfterDays(now, config.retentionDays);
  return earliestExpiry(
    retention,
    spam === 'spam' ? expiresAfterDays(now, SPAM_RETENTION_DAYS) : null,
  );
}

async function exportSubject(runtime: ReviewsRuntime, email: string) {
  const result = createSubjectCollection();
  const repository = reviewsRepository(runtime);
  let cursor: string | undefined;
  do {
    // oxlint-disable-next-line no-await-in-loop -- The next scoped page depends on this cursor.
    const rows = await repository.findBySubject(
      email,
      repositoryPage({ limit: MAX_PAGE_SIZE, cursor }),
    );
    const page = pageResult(rows, MAX_PAGE_SIZE);
    for (const row of page.data)
      result.add({
        id: row.id,
        collectionId: row.instanceId,
        configVersion: row.configVersion,
        rating: row.rating,
        title: row.title,
        body: row.body,
        authorName: row.authorName,
        email: row.subjectEmail,
        publicFields: row.publicFields,
        privateFields: row.privateFields,
        moderationStatus: row.moderationStatus,
        spamVerdict: row.spamVerdict,
        isTest: row.isTest,
        source: row.source,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        moderatedAt: row.moderatedAt?.toISOString() ?? null,
        publishedAt: row.publishedAt?.toISOString() ?? null,
        expiresAt: row.expiresAt?.toISOString() ?? null,
      });
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return { reviews: result.values };
}

async function deleteSubject(runtime: ReviewsRuntime, email: string) {
  const repository = reviewsRepository(runtime);
  let total = 0;
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- Delete every matching batch in the caller's transaction.
    const deleted = await repository.deleteBySubject(email, MAX_PAGE_SIZE);
    total += deleted;
    if (deleted < MAX_PAGE_SIZE) return total;
  }
}

export const reviewPrivacy = {
  exportSubject,
  deleteSubject,
  eraseScope: (runtime: ReviewsRuntime, { limit }: { limit: number }) =>
    reviewsRepository(runtime).eraseBatch(limit),
};
