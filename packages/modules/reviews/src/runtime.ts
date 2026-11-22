import { AppError, type ModuleRuntime } from '@backbricks/core';

import type { ReviewsConfig } from './config.ts';

export type ReviewsRuntime = ModuleRuntime<ReviewsConfig, never, never, never, never, 'reviews'>;

export function reviewsRepository(runtime: ReviewsRuntime) {
  if (!runtime.repository) throw new AppError('internal_error');
  return runtime.repository;
}
