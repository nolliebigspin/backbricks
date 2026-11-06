import type { paths, operations } from '@backbricks/api-contract';
import createClient, { type Client, type ClientOptions } from 'openapi-fetch';

export type AdminOperations = operations;
export type AdminClient = Client<paths>;
export type { ClientOptions as AdminClientOptions } from 'openapi-fetch';
/** Typed management requests. Same-origin cookies work by default; callers supply credentials explicitly elsewhere. */
export function createAdminClient(options: ClientOptions = {}): AdminClient {
  return createClient<paths>({ credentials: 'same-origin', ...options });
}
