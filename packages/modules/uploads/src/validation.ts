import { AppError, type FieldError } from '@backbricks/core';

import type { UploadsConfig } from './config.ts';
import { UPLOAD_LIMITS } from './constants.ts';
import { uploadDeclarationSchema, type UploadDeclaration } from './declaration.ts';
import { UPLOAD_FORMATS, uploadExtension } from './formats.ts';

/** Checks declared metadata only; the scan worker must validate the actual final object's bytes. */
export function validateUploadDeclaration(
  config: UploadsConfig,
  input: unknown,
): UploadDeclaration {
  const result = uploadDeclarationSchema.safeParse(input);
  if (!result.success)
    throw new AppError('validation_failed', {
      errors: result.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        code:
          issue.code === 'unrecognized_keys'
            ? 'unknown_field'
            : issue.path[0] === 'size' && issue.code === 'too_big'
              ? 'too_large'
              : 'invalid_file',
        message: 'The file declaration is invalid.',
      })),
    });
  const file = result.data;
  const errors: FieldError[] = [];
  const format = UPLOAD_FORMATS.find((entry) => entry.mime === file.type);
  if (!format || !config.presets.includes(format.preset))
    errors.push({ path: 'type', code: 'invalid_file', message: 'This file type is not allowed.' });
  if (!format?.extensions.some((extension) => extension === uploadExtension(file.name)))
    errors.push({
      path: 'name',
      code: 'invalid_file',
      message: 'The filename extension does not match the declared file type.',
    });
  if (file.size > config.maxSizeMb * UPLOAD_LIMITS.bytesPerMb)
    errors.push({
      path: 'size',
      code: 'too_large',
      message: 'The file exceeds the zone size limit.',
    });
  if (errors.length) throw new AppError('validation_failed', { errors });
  return file;
}
