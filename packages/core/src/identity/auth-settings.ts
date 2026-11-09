import { z } from 'zod';

import type { Config } from '../config/load.ts';
import { signupPolicySchema } from '../config/schema.ts';

export const AUTH_MIN_PASSWORD_LENGTH = 12;
/** Only public account-flow availability; no provider configuration or tenant information. */
export const authCapabilitiesSchema = z
  .object({
    signupPolicy: signupPolicySchema,
    emailAvailable: z.boolean(),
    passwordMinLength: z.literal(AUTH_MIN_PASSWORD_LENGTH),
  })
  .strict();

/** Derive browser behavior from the same configuration that guards account endpoints. */
export function authCapabilities(config: Pick<Config, 'signupPolicy' | 'mailer'>) {
  return authCapabilitiesSchema.parse({
    signupPolicy: config.signupPolicy,
    emailAvailable: Boolean(config.mailer),
    passwordMinLength: AUTH_MIN_PASSWORD_LENGTH,
  });
}
