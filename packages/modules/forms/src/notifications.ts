import {
  AppError,
  type ConfiguredInstance,
  type JsonValue,
  type NotificationSubject,
  type NotificationSubjectInput,
} from '@backbricks/core';

import type { FormsConfig } from './config.ts';
import { formsRepository, type FormsRuntime } from './runtime.ts';

/** Plain-text rendering of a stored answer; the mail template escapes it (I8). */
export function notificationValue(value: JsonValue): string {
  if (value === true) return '✓';
  if (value === false) return '✗';
  if (value === null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map((item) => notificationValue(item)).join(', ');
  // Consent is stored as { accepted, version, acceptedAt } (validator.ts).
  if (value['accepted'] === true && typeof value['version'] === 'string')
    return `✓ (${value['version']})`;
  return JSON.stringify(value);
}

/**
 * What a notification may say about an entry: nothing for spam or test entries, labels and values
 * of the entry's own config version only when the rule opted into content (docs/modules/forms.md §6).
 */
export async function describeEntry(
  runtime: FormsRuntime,
  input: NotificationSubjectInput<ConfiguredInstance<FormsConfig>>,
): Promise<NotificationSubject | null> {
  let entry;
  try {
    entry = await formsRepository(runtime).get(input.instance.id, input.subjectId);
  } catch (error) {
    if (error instanceof AppError && error.code === 'not_found') return null;
    throw error;
  }
  if (entry.spamVerdict === 'spam' || entry.isTest) return null;
  if (!input.includeContent) return { fields: [] };
  const historical = await runtime.instances.revision(input.instance.key, entry.configVersion);
  return {
    fields: historical.config.fields.flatMap((field) => {
      const value = entry.data[field.key];
      return value === undefined ? [] : [{ label: field.label, value: notificationValue(value) }];
    }),
  };
}
