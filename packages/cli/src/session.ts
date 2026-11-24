// SPDX-License-Identifier: MIT

import { createHash } from 'node:crypto';
import { join } from 'node:path';

import { environment } from './environment.config.ts';
import { CliError, exit } from './errors.ts';
import { atomicText, optionalText, requireDirectoryIfPresent } from './local-files.ts';
import { apiBaseUrl } from './target.ts';

const sessionCookie = /^(?:__Secure-)?better-auth\.session_token=[\w.%~-]+$/;

export function explicitBase(baseUrl: string | undefined) {
  const value = baseUrl ?? environment().baseUrl;
  if (!value) throw new CliError('missing_target', 'Provide --base-url to select the deployment.');
  return apiBaseUrl(value);
}

function cookieFile(baseUrl: string) {
  const directory = join(environment().directory, 'sessions');
  const target = createHash('sha256').update(baseUrl).digest('hex');
  return { directory, path: join(directory, target) };
}

export async function sessionHeaders(baseUrl: string) {
  const { directory, path } = cookieFile(baseUrl);
  await requireDirectoryIfPresent(directory);
  const cookie = await optionalText(path, true);
  if (!cookie || !sessionCookie.test(cookie))
    throw new CliError('missing_session', 'Run backbricks session login for this deployment.');
  return { Cookie: cookie, ...originHeaders(baseUrl) };
}

function originHeaders(baseUrl: string) {
  return { Origin: new URL(baseUrl).origin, 'X-Backbricks-CSRF': '1' };
}

export async function fixedFetch(url: string | URL, init: RequestInit = {}) {
  try {
    return await fetch(url, {
      ...init,
      redirect: 'error',
      credentials: 'omit',
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new CliError('network_error', 'Could not reach the selected service.', exit.remote);
  }
}

export async function signIn(baseUrl: string, email: string, password: string) {
  const response = await fixedFetch(`${baseUrl}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { ...originHeaders(baseUrl), 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, rememberMe: false }),
  });
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(';', 1)[0])
    .find((value) => value && sessionCookie.test(value));
  await response.body?.cancel();
  if (!response.ok || !cookie)
    throw new CliError(
      'sign_in_failed',
      'Dashboard sign-in failed. Check the account and verification status.',
      exit.remote,
    );
  const { directory, path } = cookieFile(baseUrl);
  await requireDirectoryIfPresent(directory);
  await atomicText(path, cookie, { current: await optionalText(path, true) });
}

export async function signOut(baseUrl: string) {
  const headers = await sessionHeaders(baseUrl);
  const response = await fixedFetch(`${baseUrl}/api/auth/sign-out`, {
    method: 'POST',
    headers,
  });
  await response.body?.cancel();
  if (!response.ok && response.status !== 401)
    throw new CliError('sign_out_failed', 'Could not revoke the dashboard session.', exit.remote);
  await atomicText(cookieFile(baseUrl).path, '', { current: headers.Cookie });
}
