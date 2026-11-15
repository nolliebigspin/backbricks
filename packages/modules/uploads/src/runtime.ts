import { AppError, type ModuleRuntime } from '@backbricks/core';

import type { UploadsConfig } from './config.ts';
import type { UploadsRepository } from './repository.ts';

export type UploadsRuntime = ModuleRuntime<
  UploadsConfig,
  never,
  never,
  'storage',
  'scanner' | 'queue',
  'uploads'
>;
/** The repository is selected by composition and remains bound to the caller's transaction. */
export function uploadsRepository(runtime: {
  repository: UploadsRepository | undefined;
}): UploadsRepository {
  if (!runtime.repository)
    throw new AppError('internal_error', { detail: 'The uploads repository is not bound.' });
  return runtime.repository;
}
