import { useQuery } from '@tanstack/react-query';

import { admin } from '../auth/client.ts';
import { unwrap } from './feedback.tsx';

/** Only implemented modules may contribute live dashboard navigation. */
export function useOperationalModules() {
  return useQuery({
    queryKey: ['module-availability'],
    queryFn: async ({ signal }) =>
      unwrap(await admin.GET('/v1/meta', { signal })).modules.filter(
        (module) => module.operational,
      ),
  });
}
