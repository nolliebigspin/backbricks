import { AppError, type ConfiguredInstance, type NotificationSubjectInput } from '@backbricks/core';

import type { UploadsConfig } from './config.ts';
import { uploadsRepository, type UploadsRuntime } from './runtime.ts';

/** Upload alerts never include names, file contents, tokens, scan signatures or signed URLs. */
export async function describeUpload(
  runtime: UploadsRuntime,
  input: NotificationSubjectInput<ConfiguredInstance<UploadsConfig>>,
) {
  try {
    const file = await uploadsRepository(runtime).get(
      input.subjectId,
      runtime.services.clock.now(),
    );
    return file.instanceId === input.instance.id && !file.isTest ? { fields: [] } : null;
  } catch (error) {
    if (error instanceof AppError && error.code === 'not_found') return null;
    throw error;
  }
}
