import {
  expiresAfterDays,
  earliestExpiry,
  SPAM_RETENTION_DAYS,
  type JsonValue,
} from '@backbricks/core';

import type { FormsConfig } from './config.ts';
import type { SpamStatus } from './repository.ts';

export { SPAM_RETENTION_DAYS };

/** Expiry of an entry received at `createdAt`: retention, capped for spam. */
export function entryExpiry(
  config: Pick<FormsConfig, 'retentionDays'>,
  createdAt: Date,
  verdict: SpamStatus,
): Date | null {
  const retention =
    config.retentionDays === null ? null : expiresAfterDays(createdAt, config.retentionDays);
  return verdict === 'spam'
    ? earliestExpiry(retention, expiresAfterDays(createdAt, SPAM_RETENTION_DAYS))
    : retention;
}

/** Expiry after the owner marks an entry as spam at `now`: never later than the current one. */
export function markedSpamExpiry(current: Date | null, now: Date): Date {
  const cap = expiresAfterDays(now, SPAM_RETENTION_DAYS);
  return current && current < cap ? current : cap;
}

const SEARCHABLE = new Set(['text', 'textarea', 'email', 'phone', 'url', 'hidden', 'select']);
const MAX_SEARCH_TEXT = 100_000;
/** Text that full-text search indexes: text-like answers only, never source or consent (D45). */
export function searchText(config: FormsConfig, data: Readonly<Record<string, JsonValue>>) {
  const parts: string[] = [];
  for (const field of config.fields) {
    const value = data[field.key];
    if (SEARCHABLE.has(field.type) && typeof value === 'string') parts.push(value);
    if (field.type === 'multiselect' && Array.isArray(value))
      parts.push(...value.filter((item): item is string => typeof item === 'string'));
  }
  return parts.join('\n').slice(0, MAX_SEARCH_TEXT);
}
