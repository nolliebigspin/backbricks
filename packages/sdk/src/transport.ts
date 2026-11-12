import { errorFromResponse, networkError } from './errors.ts';

type Credentials =
  | { publishableKey: string; secretKey?: never }
  | { secretKey: string; publishableKey?: never };
export type ClientOptions = Credentials & {
  /** API address of your Backbricks server, e.g. `https://backbricks.example.com/v1`. */
  baseUrl: string;
  /** Replaces the global `fetch`, e.g. for tests or custom agents. */
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
};

/** Shared request plumbing: base URL, credentials and error conversion. */
export type Transport = {
  /** Publishable keys run in browsers and must solve proof-of-work; secret keys skip it. */
  readonly publishable: boolean;
  request(
    path: string,
    init: { method: 'GET' | 'POST'; body?: unknown; headers?: Record<string, string> },
    signal?: AbortSignal,
  ): Promise<unknown>;
};

/** Accepts the address with or without the `/v1` suffix (the dashboard shows it with). */
function apiBase(baseUrl: string) {
  const url = new URL(baseUrl);
  const path = url.pathname.replace(/\/+$/, '');
  url.pathname = path.endsWith('/v1') ? path : `${path}/v1`;
  url.search = '';
  url.hash = '';
  return url.href;
}

export function createTransport(options: ClientOptions): Transport {
  const base = apiBase(options.baseUrl);
  const key = options.publishableKey ?? options.secretKey;
  if (!key) throw new TypeError('createClient needs a publishableKey or a secretKey.');
  const send = options.fetch ?? ((url: string, init: RequestInit) => fetch(url, init));
  return {
    publishable: options.publishableKey !== undefined,
    async request(path, init, signal) {
      let response: Response;
      try {
        response = await send(`${base}${path}`, {
          method: init.method,
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${key}`,
            ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
            ...init.headers,
          },
          body: init.body === undefined ? undefined : JSON.stringify(init.body),
          signal,
        });
      } catch (cause) {
        if (signal?.aborted) throw cause;
        throw networkError(cause);
      }
      if (!response.ok) throw await errorFromResponse(response);
      return response.json();
    },
  };
}
