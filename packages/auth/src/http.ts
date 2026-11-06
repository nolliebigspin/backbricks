import { z } from 'zod';

export const AUTH_BASE_PATH = '/api/auth';
export const AUTH_EMAIL_ACTIONS: readonly string[] = [
  '/sign-up/email',
  '/request-password-reset',
  '/send-verification-email',
];
const endpoints: Readonly<Record<string, string>> = {
  '/sign-up/email': 'POST',
  '/sign-in/email': 'POST',
  '/sign-out': 'POST',
  '/get-session': 'GET',
  '/verify-email': 'GET',
  '/send-verification-email': 'POST',
  '/request-password-reset': 'POST',
  '/reset-password': 'POST',
};

/** Closed allowlist: every plugin or future library route stays inaccessible until approved. */
export function authEndpoint(path: string, method: string): string | null {
  if (!path.startsWith(`${AUTH_BASE_PATH}/`)) return null;
  const relative = path.slice(AUTH_BASE_PATH.length);
  if (endpoints[relative] === method) return relative;
  if (method === 'GET' && /^\/reset-password\/[A-Za-z0-9_-]+$/.test(relative))
    return '/reset-password/:token';
  return null;
}

export function authFailure(status: number, code: string): Response {
  return Response.json(
    { code, message: 'Authentication request could not be completed.' },
    {
      status,
      headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' },
    },
  );
}

/** Auth paths can contain password-reset bearer tokens; log only a known route template. */
export function authLogPath(path: string): string {
  if (!path.startsWith(`${AUTH_BASE_PATH}/`)) return path;
  const endpoint = authEndpoint(path, 'GET') ?? authEndpoint(path, 'POST');
  return `${AUTH_BASE_PATH}${endpoint ?? '/[unknown]'}`;
}

const callbackFields = ['callbackURL', 'redirectTo', 'errorCallbackURL', 'newUserCallbackURL'];
/** Validate every redirect before library dispatch, including duplicate query parameters. */
export function authCallbacksAllowed(
  url: URL,
  body: Uint8Array | undefined,
  origin: string,
): boolean {
  try {
    const values = callbackFields.flatMap((field) => url.searchParams.getAll(field));
    if (body?.length) {
      const record = z
        .record(z.string(), z.unknown())
        .parse(JSON.parse(new TextDecoder().decode(body)));
      for (const field of callbackFields) {
        const value = record[field];
        if (value === undefined) continue;
        if (typeof value !== 'string') return false;
        values.push(value);
      }
    }
    return values.every((value) => {
      const target = new URL(value, origin);
      return target.origin === origin && !target.username && !target.password;
    });
  } catch {
    return false;
  }
}

/** Cookies carry session credentials; do not duplicate bearer tokens in browser-readable JSON. */
export async function publicAuthResponse(response: Response): Promise<Response> {
  const headers = new Headers(response.headers);
  headers.set('cache-control', 'no-store');
  headers.set('referrer-policy', 'no-referrer');
  if (
    (response.status >= 300 && response.status < 400) ||
    !headers.get('content-type')?.includes('application/json')
  )
    return new Response(response.body, { status: response.status, headers });
  const data: unknown = await response.json();
  if (data === null) return Response.json(null, { status: response.status, headers });
  const record = z.record(z.string(), z.unknown()).parse(data);
  delete record['token'];
  const session = z.record(z.string(), z.unknown()).safeParse(record['session']);
  if (session.success) {
    delete session.data['token'];
    delete session.data['ipAddress'];
    delete session.data['userAgent'];
    record['session'] = session.data;
  }
  headers.delete('content-length');
  return Response.json(record, { status: response.status, headers });
}
