import { BackbricksError, errorFromResponse, networkError, unexpectedResponse } from './errors.ts';
import { delay, retryDelay } from './retry.ts';

type Credentials =
  | { publishableKey: string; secretKey?: never }
  | { secretKey: string; publishableKey?: never };
export type ClientOptions = Credentials & {
  /** API address of your Backbricks server, e.g. `https://backbricks.example.com/v1`. */
  baseUrl: string;
  /** Replaces the global `fetch`, e.g. for tests or custom agents. */
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
};

export type RequestOptions = {
  method?: 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Set false for a read with side effects, such as issuing a proof-of-work challenge. */
  retry?: false;
};

/** Shared request plumbing: base URL, credentials and error conversion. */
export type Transport = {
  readonly publishable: boolean;
  readonly send: (url: string, init: RequestInit) => Promise<Response>;
  readonly nativeProgress: boolean;
  request(path: string, init?: RequestOptions, signal?: AbortSignal): Promise<unknown>;
};

function apiBase(baseUrl: string) {
  const url = new URL(baseUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new TypeError('createClient needs an HTTP(S) API base URL.');
  const path = url.pathname.replace(/\/+$/, '');
  url.pathname = path.endsWith('/v1') ? path : `${path}/v1`;
  url.search = '';
  url.hash = '';
  return url;
}

function apiUrl(base: URL, path: string, publishableKey?: string) {
  const target = new URL(`${base.href}${path}`);
  if (
    !path.startsWith('/') ||
    path.startsWith('//') ||
    path.includes('\\') ||
    target.hash ||
    target.origin !== base.origin ||
    !target.pathname.startsWith(`${base.pathname}/`) ||
    target.searchParams.has('key')
  )
    throw new BackbricksError({
      code: 'invalid_path',
      status: 0,
      message: 'Use an API-relative request path.',
    });
  if (publishableKey) target.searchParams.set('key', publishableKey);
  return target.href;
}

export function createTransport(options: ClientOptions): Transport {
  const base = apiBase(options.baseUrl);
  const { publishableKey, secretKey } = options;
  if (!publishableKey && !secretKey)
    throw new TypeError('createClient needs a publishableKey or a secretKey.');
  const send = options.fetch ?? ((url: string, init: RequestInit) => fetch(url, init));
  return {
    publishable: Boolean(publishableKey),
    send,
    nativeProgress: options.fetch === undefined,
    async request(path, init = {}, signal = init.signal) {
      const url = apiUrl(base, path, publishableKey);
      const method = init.method ?? 'GET';
      const headers = Object.fromEntries(
        Object.entries(init.headers ?? {}).filter(
          ([name]) => !['accept', 'authorization', 'content-type'].includes(name.toLowerCase()),
        ),
      );
      const request: RequestInit = {
        method,
        headers: {
          ...headers,
          Accept: 'application/json',
          ...(secretKey ? { Authorization: `Bearer ${secretKey}` } : {}),
          ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        signal,
        redirect: 'error',
        credentials: 'omit',
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      };
      const attempt = async () => {
        let response: Response;
        try {
          response = await send(url, request);
        } catch (cause) {
          if (signal?.aborted) throw cause;
          throw networkError(cause);
        }
        return response;
      };

      let response: Response;
      if (init.retry !== false && (method === 'GET' || method === 'HEAD')) {
        const first = await attempt().catch((error: unknown) => {
          if (!(error instanceof BackbricksError) || error.code !== 'network_error') throw error;
          return error;
        });
        const wait = retryDelay(first instanceof BackbricksError ? undefined : first);
        if (wait === undefined && !(first instanceof BackbricksError)) {
          response = first;
        } else {
          if (!(first instanceof BackbricksError)) await first.body?.cancel().catch(() => {});
          await delay(wait ?? 0, signal);
          response = await attempt();
        }
      } else {
        response = await attempt();
      }
      if (response.status === 304) return undefined;
      if (!response.ok) throw await errorFromResponse(response);
      if (method === 'HEAD' || response.status === 204 || response.status === 205) return undefined;
      try {
        return await response.json();
      } catch {
        if (signal?.aborted) throw signal.reason;
        throw unexpectedResponse();
      }
    },
  };
}
