import { betterAuth } from 'better-auth';

import { createAuthSchemaOptions } from './src/schema-options.ts';

// CLI-only configuration: no database, env reads or runtime authentication service.
export const auth = betterAuth({
  ...createAuthSchemaOptions(),
  secret: 'schema-generation-only-not-a-runtime-secret-0000',
  baseURL: 'http://schema-generation.invalid',
});
