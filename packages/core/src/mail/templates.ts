import { z } from 'zod';

import { AppError } from '../errors/app-error.ts';
import { AUTH_BASE_PATH } from '../http/auth-path.ts';
import type { MailMessage } from './contract.ts';

const mailKindSchema = z.enum([
  'verify_email',
  'reset_password',
  'invitation',
  'secret_key_exposed',
]);
const templateInputSchema = z
  .object({
    kind: mailKindSchema,
    to: z.email(),
    url: z.string(),
    locale: z.enum(['en', 'de']).default('en'),
    organizationName: z.string().max(120).optional(),
  })
  .strict();
export type AuthMailInput = z.input<typeof templateInputSchema>;

const copy = {
  en: {
    verify_email: {
      subject: 'Confirm your email address',
      intro: 'Use this link to confirm your email address.',
      action: 'Confirm email',
    },
    reset_password: {
      subject: 'Reset your password',
      intro: 'Use this link to choose a new password.',
      action: 'Reset password',
    },
    invitation: {
      subject: 'You are invited to Backbricks',
      intro: 'You have been invited to join a team.',
      action: 'Accept invitation',
    },
    secret_key_exposed: {
      subject: 'Rotate an exposed secret key',
      intro:
        'A secret key was used from an unexpected website. Revoke that key and create a replacement in Backbricks.',
      action: 'Review activity',
    },
  },
  de: {
    verify_email: {
      subject: 'E-Mail-Adresse bestätigen',
      intro: 'Bestätige deine E-Mail-Adresse über diesen Link.',
      action: 'E-Mail bestätigen',
    },
    reset_password: {
      subject: 'Passwort zurücksetzen',
      intro: 'Wähle über diesen Link ein neues Passwort.',
      action: 'Passwort zurücksetzen',
    },
    invitation: {
      subject: 'Du bist zu Backbricks eingeladen',
      intro: 'Du wurdest eingeladen, einem Team beizutreten.',
      action: 'Einladung annehmen',
    },
    secret_key_exposed: {
      subject: 'Einen offengelegten geheimen Schlüssel ersetzen',
      intro:
        'Ein geheimer Schlüssel wurde von einer unerwarteten Website verwendet. Widerrufe ihn und erstelle in Backbricks einen neuen.',
      action: 'Aktivitäten ansehen',
    },
  },
} as const;

/** Escapes text and attribute values without interpreting user content as markup. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

function trustedLink(publicUrl: string, input: string, kind: AuthMailInput['kind']): string {
  try {
    const base = new URL(publicUrl);
    const url = new URL(input, base);
    if (base.username || base.password) throw new Error();
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.origin !== base.origin ||
      url.username ||
      url.password ||
      url.hash
    )
      throw new Error();
    const allowed =
      kind === 'verify_email'
        ? url.pathname === `${AUTH_BASE_PATH}/verify-email`
        : kind === 'reset_password'
          ? url.pathname.startsWith(`${AUTH_BASE_PATH}/reset-password/`) &&
            /^[A-Za-z0-9_-]+$/.test(url.pathname.slice(`${AUTH_BASE_PATH}/reset-password/`.length))
          : kind === 'invitation'
            ? url.pathname === '/accept-invitation'
            : url.pathname === '/activity';
    if (!allowed) throw new Error();
    const callback = url.searchParams.get('callbackURL');
    if (callback) {
      const target = new URL(callback, base);
      if (target.origin !== base.origin || target.username || target.password) throw new Error();
    }
    return url.href;
  } catch {
    throw new AppError('internal_error');
  }
}

/** Render only supported auth/security messages; never include submission data or secret keys. */
export function renderAuthMail(publicUrl: string, input: AuthMailInput): MailMessage {
  const parsed = templateInputSchema.safeParse(input);
  if (!parsed.success) throw new AppError('internal_error');
  const data = parsed.data;
  const url = trustedLink(publicUrl, data.url, data.kind);
  const text = copy[data.locale][data.kind];
  const organization = data.kind === 'invitation' ? data.organizationName : undefined;
  return {
    to: data.to,
    subject: text.subject,
    text: [text.intro, organization, url].filter((value) => value !== undefined).join('\n\n'),
    html: `<p>${escapeHtml(text.intro)}</p>${organization ? `<p>${escapeHtml(organization)}</p>` : ''}<p><a href="${escapeHtml(url)}">${escapeHtml(text.action)}</a></p>`,
  };
}
