import { renderAuthMail, type MailMessage } from '@backbricks/core';
import type { organization } from 'better-auth/plugins';

import type { DashboardAuthOptions } from '../contracts.ts';

/** Keep bearer invitation delivery in request memory until the enclosing transaction commits. */
export function createOrganizationOptions(
  options: DashboardAuthOptions,
  pending: MailMessage[],
): NonNullable<Parameters<typeof organization>[0]> {
  return {
    disableOrganizationDeletion: true,
    requireEmailVerificationOnInvitation: true,
    sendInvitationEmail: async ({ email, id, organization: target }) => {
      if (!options.mailer) return;
      const url = new URL('/accept-invitation', options.config.publicUrl);
      url.searchParams.set('invitationId', id);
      pending.push(
        renderAuthMail(options.config.publicUrl, {
          kind: 'invitation',
          to: email,
          organizationName: target.name,
          url: url.href,
        }),
      );
    },
  };
}
