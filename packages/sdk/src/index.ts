/**
 * TypeScript SDK for websites and servers. Dependency-free: runs in browsers, Node ≥ 20 and Bun.
 * The typed management client lives in `@backbricks/sdk/admin`.
 */
import { createClientFor, type Client, type ClientOptions } from './client.ts';

/**
 * Typed payloads per resource, filled by `backbricks codegen` through module augmentation
 * (`declare module '@backbricks/sdk' { interface BackbricksSchema { 'forms/contact': … } }`).
 */
export interface BackbricksSchema {}

export type BackbricksClient = Client<BackbricksSchema>;

/**
 * Publishable keys (`bb_pk_…`) belong in website code and solve proof-of-work automatically;
 * secret keys (`bb_sk_…`) are for your server only.
 */
export function createClient(options: ClientOptions): BackbricksClient {
  return createClientFor<BackbricksSchema>(options);
}

export type { ClientOptions } from './transport.ts';
export type { FormValues, FormsClient, SubmitOptions, SubmitResult } from './forms.ts';
export { BackbricksError, type FieldError } from './errors.ts';
