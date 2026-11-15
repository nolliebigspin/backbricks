import { AppError } from '../errors/app-error.ts';
import { jsonValueSchema, type JsonValue } from '../modules/values.ts';

export const SUBJECT_EXPORT_LIMITS = Object.freeze({
  records: 10_000,
  metadataBytes: 8 * 1024 * 1024,
  archiveBytes: 1024 * 1024 * 1024,
});
const encoder = new TextEncoder();
/** Check while accumulating, before an oversized subject can allocate its complete response. */
export function createSubjectCollection() {
  const values: JsonValue[] = [];
  let bytes = 2;
  return {
    values,
    add(input: unknown) {
      const value = jsonValueSchema.parse(input);
      bytes += encoder.encode(JSON.stringify(value)).length + 1;
      if (
        values.length >= SUBJECT_EXPORT_LIMITS.records ||
        bytes > SUBJECT_EXPORT_LIMITS.metadataBytes
      )
        throw new AppError('payload_too_large', {
          detail:
            'The complete subject export exceeds the supported limit. Use an offline administrator export.',
        });
      values.push(value);
    },
  };
}
export function subjectMetadataBytes(value: JsonValue) {
  const bytes = encoder.encode(JSON.stringify(value));
  if (bytes.length > SUBJECT_EXPORT_LIMITS.metadataBytes)
    throw new AppError('payload_too_large', {
      detail: 'The complete subject export exceeds the supported metadata limit.',
    });
  return bytes;
}

/** Reserve bounded ZIP headers/directories as well as content and the complete manifest. */
export function assertSubjectArchiveSize(
  fileBytes: number,
  metadataBytes: number,
  fileCount: number,
) {
  const entryOverheadBytes = 512;
  if (
    fileBytes + metadataBytes + (fileCount + 1) * entryOverheadBytes >
    SUBJECT_EXPORT_LIMITS.archiveBytes
  )
    throw new AppError('payload_too_large', {
      detail: 'The complete archive exceeds the supported one GiB limit.',
    });
}
