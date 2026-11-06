/** Accept local application paths only, including when the value came from an email link. */
export function safeRedirect(value: string | null, origin: string): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
  try {
    const url = new URL(value, origin);
    return url.origin === origin && !url.username && !url.password
      ? `${url.pathname}${url.search}${url.hash}`
      : '/';
  } catch {
    return '/';
  }
}

/** Errors never render server text, email addresses or supplied bearer tokens. */
export function accountError(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : '';
  switch (code) {
    case 'EMAIL_NOT_VERIFIED':
      return 'auth.errors.unverified';
    case 'SIGNUP_DISABLED':
      return 'auth.errors.inviteOnly';
    case 'EMAIL_UNAVAILABLE':
      return 'auth.errors.noEmail';
    case 'RATE_LIMITED':
      return 'auth.errors.rateLimit';
    case 'INVALID_TOKEN':
    case 'TOKEN_EXPIRED':
    case 'INVALID_INVITATION':
    case 'NOT_FOUND':
      return 'auth.errors.expired';
    case 'LAST_OWNER':
      return 'auth.errors.lastOwner';
    case 'UNAUTHORIZED':
      return 'auth.errors.session';
    case 'INVALID_EMAIL_OR_PASSWORD':
      return 'auth.errors.credentials';
    default:
      return 'auth.errors.generic';
  }
}
