import { createAdminClient } from '@backbricks/sdk/admin';
import { organizationClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

/** Public library types only; the server's guarded surface remains the authority. */
export const auth = createAuthClient({
  plugins: [organizationClient()],
  fetchOptions: {
    credentials: 'same-origin',
    headers: { 'x-backbricks-csrf': '1' },
    customFetchImpl: (...args) => globalThis.fetch(...args),
  },
});
export const admin = createAdminClient({
  headers: { 'x-backbricks-csrf': '1' },
  fetch: (request) => globalThis.fetch(request),
});
