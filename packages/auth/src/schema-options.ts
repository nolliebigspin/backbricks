import type { betterAuth } from 'better-auth';
import { organization } from 'better-auth/plugins';

/** Shared schema-affecting auth options; the runtime supplies its transaction and services. */
export function createAuthSchemaOptions(): Parameters<typeof betterAuth>[0] {
  return {
    emailAndPassword: { enabled: true },
    plugins: [organization()],
    telemetry: { enabled: false },
  };
}
