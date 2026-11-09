import type { betterAuth } from 'better-auth';
import { organization } from 'better-auth/plugins';

/** Shared schema-affecting auth options; the runtime supplies its transaction and services. */
export function createAuthSchemaOptions(options?: Parameters<typeof organization>[0]) {
  return {
    emailAndPassword: { enabled: true },
    plugins: [organization(options)],
    telemetry: { enabled: false },
  } satisfies Parameters<typeof betterAuth>[0];
}
