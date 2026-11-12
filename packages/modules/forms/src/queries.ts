import type { z } from 'zod';

import type { submissionFiltersSchema } from './admin-schemas.ts';
import type { SubmissionFilters } from './repository.ts';

/** One interpretation of filters for list and export queries. */
export function submissionFilters(
  query: z.infer<typeof submissionFiltersSchema>,
): SubmissionFilters {
  return {
    status: query.status,
    read: query.read,
    folder: query.folder,
    isTest: query.test,
    from: query.from ? new Date(query.from) : undefined,
    to: query.to ? new Date(query.to) : undefined,
    query: query.q,
  };
}
