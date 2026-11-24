// SPDX-License-Identifier: AGPL-3.0-only

import { betterAuth } from 'better-auth';
import { z } from 'zod';

import { AUTH_MIN_PASSWORD_LENGTH } from './constants.ts';
import type { AuthPersistence, DashboardAuthOptions } from './contracts.ts';
import { createDashboardAuthOptions } from './options.ts';

export const setupOwnerSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    email: z
      .email()
      .max(254)
      .transform((value) => value.toLowerCase()),
    password: z.string().min(AUTH_MIN_PASSWORD_LENGTH).max(128),
  })
  .strict();

/** Only reachable from the operator bootstrap transaction. This account is verified out of band. */
export async function createSetupOwner(
  options: DashboardAuthOptions,
  persistence: AuthPersistence,
  input: z.input<typeof setupOwnerSchema>,
) {
  const auth = betterAuth(
    createDashboardAuthOptions(options, persistence, [], undefined, undefined, true),
  );
  const result = await auth.api.signUpEmail({ body: setupOwnerSchema.parse(input) });
  return result.user.id;
}
