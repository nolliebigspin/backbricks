import { z } from 'zod';

import type { AppError } from '../errors/app-error.ts';
import { ERROR_CODES } from '../errors/codes.ts';
import { redactSecretText } from '../logging/redact.ts';
import { escapeHtml } from '../mail/templates.ts';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
export const MAX_PUBLIC_REDIRECT_URL_LENGTH = 2048;
export const PUBLIC_FORM_PROOF_FIELD = 'altcha';
export const PUBLIC_FORM_MEDIA_TYPE = 'application/x-www-form-urlencoded';

/** Ignore optional charset parameters when selecting a declared transport. */
export function isPublicFormContentType(value: string | undefined): boolean {
  return value?.split(';')[0]?.trim().toLowerCase() === PUBLIC_FORM_MEDIA_TYPE;
}
/** Shape shared by module config and HTML responses; origin authorization happens on each POST. */
export const publicRedirectUrlSchema = z
  .string()
  .max(MAX_PUBLIC_REDIRECT_URL_LENGTH)
  .refine(
    (value) => {
      if (
        !/^https?:\/\//.test(value) ||
        /[\s\\]/.test(value) ||
        value.split('').some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) ||
        redactSecretText(value) !== value ||
        !URL.canParse(value)
      )
        return false;
      const url = new URL(value);
      return (
        (url.protocol === 'https:' ||
          (url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname))) &&
        !url.username &&
        !url.password &&
        !url.hash &&
        !url.hostname.includes('*')
      );
    },
    { message: 'Expected an absolute https URL without credentials or fragment.' },
  );

export type PublicFormRedirects = Readonly<{ success?: string; error?: string; back?: string }>;
export const FORM_SETUP_DETAIL = 'This form is not configured for plain HTML submissions.';

/** Empty origin lists never authorize redirects; return a canonical URL safe for Location. */
export function publicFormRedirect(
  value: unknown,
  allowedOrigins: readonly string[],
): string | undefined {
  const parsed = publicRedirectUrlSchema.safeParse(value);
  if (!parsed.success || allowedOrigins.length === 0) return undefined;
  const url = new URL(parsed.data);
  return allowedOrigins.includes(url.origin) ? url.href : undefined;
}

/** Only structural codes/paths leave the server; no error detail or submitted values are rendered. */
export function publicFormFailure(error: AppError, redirects: PublicFormRedirects = {}): Response {
  const fields = error.errors?.map(({ path }) => redactSecretText(path)) ?? [];
  const headers = {
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'",
    'Referrer-Policy': 'no-referrer',
  };
  if (redirects.error) {
    const target = new URL(redirects.error);
    target.searchParams.set('error', error.code);
    target.searchParams.delete('fields');
    if (fields.length) target.searchParams.set('fields', fields.join(','));
    return new Response(null, { status: 303, headers: { ...headers, Location: target.href } });
  }
  const title = ERROR_CODES[error.code].title;
  const issues = (error.errors ?? [])
    .map(({ path, code }) => `<li>${escapeHtml(redactSecretText(path))}: ${escapeHtml(code)}</li>`)
    .join('');
  const help =
    error.detail === FORM_SETUP_DETAIL
      ? FORM_SETUP_DETAIL
      : 'Go back and check the form, or contact the site owner.';
  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><title>${escapeHtml(title)}</title><h1>${escapeHtml(title)}</h1><p>${escapeHtml(help)}</p>${issues ? `<ul>${issues}</ul>` : ''}<p><a href="${escapeHtml(redirects.back ?? '/')}">Back to the site</a></p></html>`,
    {
      status: error.status,
      headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' },
    },
  );
}
