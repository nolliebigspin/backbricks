/**
 * The settings tab edits these keys of a form's config and keeps every other key as stored. The
 * server's forms schema stays the authority; this only reads values for display, with its defaults.
 */
export type FormSettings = {
  proofOfWork: boolean;
  honeypotField: string;
  /** Days, or `null` for no time limit. */
  retentionDays: number | null;
  successRedirect: string;
  errorRedirect: string;
};
type Config = Record<string, unknown>;

const record = (value: unknown): Config =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? { ...value } : {};
const text = (value: unknown) => (typeof value === 'string' ? value : '');

export function readSettings(config: unknown): FormSettings {
  const root = record(config);
  const spam = record(root['spam']);
  const redirects = record(root['redirects']);
  const retention = root['retentionDays'];
  return {
    proofOfWork: spam['proofOfWork'] !== false,
    honeypotField: text(spam['honeypotField']) || '_gotcha',
    retentionDays: retention === null ? null : typeof retention === 'number' ? retention : 180,
    successRedirect: text(redirects['success']),
    errorRedirect: text(redirects['error']),
  };
}

/** The full config to replace with (PUT keeps `null`, which a merge patch would delete). */
export function writeSettings(config: unknown, settings: FormSettings): Config {
  const { redirects: _previous, ...root } = record(config);
  return {
    ...root,
    spam: {
      ...record(root['spam']),
      proofOfWork: settings.proofOfWork,
      honeypotField: settings.honeypotField,
    },
    retentionDays: settings.retentionDays,
    ...(settings.successRedirect
      ? {
          redirects: {
            success: settings.successRedirect,
            ...(settings.errorRedirect ? { error: settings.errorRedirect } : {}),
          },
        }
      : {}),
  };
}

/** Redirects to a domain outside the project's allowed list are refused at submit time. */
export function redirectOutsideOrigins(url: string, allowedOrigins: readonly string[]): boolean {
  if (!url || allowedOrigins.length === 0) return false;
  try {
    return !allowedOrigins.includes(new URL(url).origin);
  } catch {
    return false;
  }
}
