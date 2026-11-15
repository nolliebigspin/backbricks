import { AppError, parseFileReference, type JsonValue } from '@backbricks/core';

import type { FormsConfig } from './config.ts';
import type { SubmissionRecord, ErasedSubmission } from './repository.ts';
import type { FormsRuntime } from './runtime.ts';

export const FORM_SUBMISSION_OWNER = 'form_submission';

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
    owner: { type: FORM_SUBMISSION_OWNER, id: owner.id },
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

/** A disabled provider must not leave attached files live after their owner changes or disappears. */
async function requireAttachmentProvider(runtime: FormsRuntime, row: ErasedSubmission) {
  if (runtime.capabilities.optional('files')) return;
  if (!Object.values(row.data).some((value) => Array.isArray(value) && value.length)) return;
  const historical = await runtime.instances.revisionById(row.instanceId, row.configVersion);
  if (
    historical.config.fields.some((field) => {
      const value = row.data[field.key];
      return field.type === 'file' && Array.isArray(value) && value.length > 0;
    })
  )
    throw new AppError('capability_unavailable', {
      detail: 'Enable uploads before changing or erasing entries with attached files.',
    });
}

/** Delete optional attachments through the same transaction as the owner. */
export async function deleteEntryFiles(runtime: FormsRuntime, row: ErasedSubmission) {
  await requireAttachmentProvider(runtime, row);
  await runtime.capabilities
    .optional('files')
    ?.deleteByOwner(runtime.tx, { type: FORM_SUBMISSION_OWNER, id: row.id });
}
/** Apply the trusted owner's current lifetime without exposing another module's repository. */
export async function syncEntryFileExpiry(
  runtime: FormsRuntime,
  owners: readonly Pick<
    SubmissionRecord,
    'id' | 'expiresAt' | 'instanceId' | 'configVersion' | 'data'
  >[],
) {
  if (!owners.length) return;
  for (const row of owners) {
    // oxlint-disable-next-line no-await-in-loop -- Historical owner fields prevent disabled-provider cleanup bypasses.
    await requireAttachmentProvider(runtime, row);
  }
  await runtime.capabilities.optional('files')?.syncOwnerExpiry(runtime.tx, {
    type: FORM_SUBMISSION_OWNER,
    owners: owners.map(({ id, expiresAt }) => ({ id, expiresAt })),
  });
}
