import { AppError, type ModuleRuntime } from '@backbricks/core';

import type { FormsConfig } from './config.ts';
import type { FormsRepository } from './repository.ts';

export type FormsRuntime = ModuleRuntime<FormsConfig, never, 'files', never, never, 'forms'>;

/** One checked repository seam for all forms operations. */
export function formsRepository(runtime: {
  repository: FormsRepository | undefined;
}): FormsRepository {
  if (!runtime.repository)
    throw new AppError('internal_error', { detail: 'The forms repository is not bound.' });
  return runtime.repository;
}
