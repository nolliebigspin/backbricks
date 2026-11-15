import { AppError, parseFileReference, type JsonValue } from '@backbricks/core';

import type { FormsConfig } from './config.ts';
import type { FormsRuntime } from './runtime.ts';

/** Claim one complete attachment set before persisting an entry, then replace all bearer values with IDs. */
export async function claimEntryFiles(
  runtime: FormsRuntime,
  config: FormsConfig,
  data: Readonly<Record<string, JsonValue>>,
  owner: { id: string; subjectEmail: string | null; expiresAt: Date | null },
): Promise<Record<string, JsonValue>> {
  const fields = config.fields.filter((field) => field.type === 'file');
  const files = fields.flatMap((field) => {
    const value = data[field.key];
    if (!Array.isArray(value)) return [];
    return value.map((ref) => {
      if (typeof ref !== 'string') throw new AppError('internal_error');
      return { ref, zone: field.zone };
    });
  });
  const safe = { ...data };
  if (!files.length) return safe;
  const capability = runtime.capabilities.optional('files');
  if (!capability) throw new AppError('capability_unavailable');
  await capability.claim(runtime.tx, {
    owner: { type: 'form_submission', id: owner.id },
    subjectEmail: owner.subjectEmail,
    expiresAt: owner.expiresAt,
    files,
  });
  for (const field of fields) {
    const value = safe[field.key];
    if (!Array.isArray(value)) continue;
    safe[field.key] = value.map((ref) => {
      const parsed = parseFileReference(ref);
      if (!parsed) throw new AppError('internal_error');
      return parsed.fileId;
    });
  }
  return safe;
}
