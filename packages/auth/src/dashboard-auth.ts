import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

import { AppError, type MailMessage } from '@backbricks/core';
import { betterAuth } from 'better-auth';
import { isAPIError } from 'better-auth/api';

import type { DashboardAuthOptions } from './contracts.ts';
import {
  AUTH_BASE_PATH,
  AUTH_EMAIL_ACTIONS,
  authCallbacksAllowed,
  authEndpoint,
  authFailure,
  publicAuthResponse,
} from './http.ts';
import {
  AUTH_BODY_LIMIT_BYTES,
  AUTH_TOKEN_LIFETIME_SECONDS,
  AUTH_RATE_WINDOW_MS,
  AUTH_REQUEST_LIMIT,
  AUTH_CREDENTIAL_LIMIT,
  AUTH_RESPONSE_FLOOR_MS,
  AUTH_MAX_TOKEN_LENGTH,
  createDashboardAuthOptions,
} from './options.ts';

/** The only public runtime boundary; never export an unguarded singleton or raw auth handler. */
export function createDashboardAuth(options: DashboardAuthOptions) {
  const origin = new URL(options.config.publicUrl).origin;
  if (options.config.nodeEnv === 'production' && !origin.startsWith('https:')) {
    throw new AppError('service_unavailable', {
      detail: 'Production authentication requires HTTPS.',
    });
  }
  const deliveries = new Set<Promise<unknown>>();
  async function dispatch(request: Request, ipHash: string): Promise<Response> {
    const url = new URL(request.url);
    const endpoint = authEndpoint(url.pathname, request.method);
    if (!endpoint) return authFailure(404, 'NOT_FOUND');
    const unsafe = request.method !== 'GET';
    const emailNavigation =
      !unsafe && ['/verify-email', '/reset-password/:token'].includes(endpoint);
    if (
      (request.headers.has('origin') && request.headers.get('origin') !== origin) ||
      (unsafe &&
        (request.headers.get('origin') !== origin ||
          request.headers.get('x-backbricks-csrf') !== '1')) ||
      (request.headers.get('sec-fetch-site') === 'cross-site' && !emailNavigation)
    )
      return authFailure(403, 'INVALID_ORIGIN');
    const limit = await options.limiter.consume({
      namespace: 'auth.request',
      identity: ipHash,
      limit: AUTH_REQUEST_LIMIT,
      windowMs: AUTH_RATE_WINDOW_MS,
    });
    if (!limit.allowed) {
      const response = authFailure(429, 'RATE_LIMITED');
      response.headers.set('retry-after', String(limit.retryAfterSeconds));
      return response;
    }
    if (endpoint === '/sign-in/email' || AUTH_EMAIL_ACTIONS.includes(endpoint)) {
      const sensitive = await options.limiter.consume({
        namespace: 'auth.credentials',
        identity: ipHash,
        limit: AUTH_CREDENTIAL_LIMIT,
        windowMs: AUTH_RATE_WINDOW_MS,
      });
      if (!sensitive.allowed) {
        const response = authFailure(429, 'RATE_LIMITED');
        response.headers.set('retry-after', String(sensitive.retryAfterSeconds));
        return response;
      }
    }
    if (endpoint === '/sign-up/email' && options.config.signupPolicy !== 'open')
      return authFailure(403, 'SIGNUP_DISABLED');
    if (!options.mailer && AUTH_EMAIL_ACTIONS.includes(endpoint))
      return authFailure(503, 'EMAIL_UNAVAILABLE');
    let body: Uint8Array | undefined;
    if (unsafe && request.body) {
      const reader = request.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        // oxlint-disable-next-line no-await-in-loop -- Reading a bounded stream is sequential.
        const part = await reader.read();
        if (part.done) break;
        size += part.value.length;
        if (size > AUTH_BODY_LIMIT_BYTES) {
          // oxlint-disable-next-line no-await-in-loop -- Cancel before rejecting an oversized stream.
          await reader.cancel();
          return authFailure(413, 'PAYLOAD_TOO_LARGE');
        }
        chunks.push(part.value);
      }
      body = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.length;
      }
    }
    if (!authCallbacksAllowed(url, body, origin)) return authFailure(403, 'INVALID_CALLBACK');
    const pending: MailMessage[] = [];
    let response: Response;
    try {
      response = await options.transaction(async (persistence) => {
        const auth = betterAuth(createDashboardAuthOptions(options, persistence, pending, ipHash));
        if (endpoint === '/verify-email') {
          const token = url.searchParams.get('token');
          if (!token || token.length > AUTH_MAX_TOKEN_LENGTH)
            throw authFailure(401, 'INVALID_TOKEN');
          const digest = createHash('sha256').update(token).digest('hex');
          const expiresAt = new Date(
            options.clock.now().getTime() + AUTH_TOKEN_LIFETIME_SECONDS * 1000,
          );
          if (!(await persistence.replay.claim(digest, expiresAt)))
            throw authFailure(401, 'INVALID_TOKEN');
        }
        const result = await auth.handler(
          new Request(request.url, { method: request.method, headers: request.headers, body }),
        );
        const location = result.headers.get('location');
        if (
          result.status >= 400 ||
          (location && new URL(location, origin).searchParams.has('error'))
        )
          throw result;
        return result;
      });
    } catch (error) {
      if (error instanceof Response && error.status < 500) {
        const headers = new Headers(error.headers);
        headers.delete('set-cookie');
        return publicAuthResponse(new Response(error.body, { status: error.status, headers }));
      }
      if (isAPIError(error) && error.statusCode < 500)
        return authFailure(error.statusCode, error.body?.code ?? 'AUTH_REQUEST_FAILED');
      options.report('auth.request_failed');
      return authFailure(503, 'AUTH_UNAVAILABLE');
    }
    // SMTP latency must not reveal whether an anonymous account exists. Drain on shutdown.
    if (pending.length > 0) {
      const delivery = Promise.all(
        pending.map(async (message) => {
          try {
            await options.mailer?.send(message);
          } catch {
            options.report('auth.mail_failed');
          }
        }),
      );
      deliveries.add(delivery);
      void delivery.then(() => deliveries.delete(delivery));
    }
    return publicAuthResponse(response);
  }
  return {
    async handle(request: Request, ipHash: string): Promise<Response> {
      const start = performance.now();
      const path = new URL(request.url).pathname;
      const anonymousEmailAction =
        request.method === 'POST' &&
        AUTH_EMAIL_ACTIONS.some((endpoint) => path === `${AUTH_BASE_PATH}${endpoint}`);
      try {
        return await dispatch(request, ipHash);
      } catch {
        options.report('auth.request_failed');
        return authFailure(503, 'AUTH_UNAVAILABLE');
      } finally {
        if (anonymousEmailAction)
          await delay(Math.max(0, AUTH_RESPONSE_FLOOR_MS - (performance.now() - start)));
      }
    },
    async drain(): Promise<void> {
      await Promise.all(deliveries);
    },
    async getSession(headers: Headers) {
      return options.transaction(async (persistence) => {
        const auth = betterAuth(createDashboardAuthOptions(options, persistence, []));
        return auth.api.getSession({ headers });
      });
    },
    basePath: AUTH_BASE_PATH,
  };
}
