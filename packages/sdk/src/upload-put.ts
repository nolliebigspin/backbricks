import { BackbricksError } from './errors.ts';

export type UploadProgress = {
  phase: 'uploading' | 'processing' | 'ready';
  loaded: number;
  total: number;
};
export type UploadSender = (url: string, init: RequestInit) => Promise<Response>;
/** Optional browser port: server consumers do not need DOM type declarations. */
type BrowserUploadRequest = EventTarget & {
  readonly upload: EventTarget;
  readonly status: number;
  withCredentials: boolean;
  open(method: string, url: string): void;
  setRequestHeader(name: string, value: string): void;
  send(body: Blob): void;
  abort(): void;
};
function isBrowserRequest(value: unknown): value is BrowserUploadRequest {
  return (
    value instanceof EventTarget &&
    'upload' in value &&
    value.upload instanceof EventTarget &&
    'status' in value &&
    typeof value.status === 'number' &&
    'withCredentials' in value &&
    typeof value.withCredentials === 'boolean' &&
    ['open', 'setRequestHeader', 'send', 'abort'].every(
      (name) => typeof Reflect.get(value, name) === 'function',
    )
  );
}
const refused = (status: number) =>
  new BackbricksError({
    code: 'upload_failed',
    status,
    message: 'The storage service did not accept the upload.',
  });
/** One provider PUT, with no Backbricks credentials, cookies or automatic retry. */
export async function putUpload(
  url: string,
  headers: Record<string, string>,
  file: Blob,
  signal: AbortSignal,
  send: UploadSender,
  progress?: (event: UploadProgress) => void,
  nativeProgress = true,
) {
  const platform: object = globalThis;
  const browser = 'window' in platform;
  const signed = Object.fromEntries(
    Object.entries(headers).filter(
      ([name]) => !browser || !['content-length', 'host'].includes(name.toLowerCase()),
    ),
  );
  progress?.({ phase: 'uploading', loaded: 0, total: file.size });
  signal.throwIfAborted();
  const constructor = 'XMLHttpRequest' in platform ? platform.XMLHttpRequest : undefined;
  if (browser && nativeProgress && typeof constructor === 'function') {
    await new Promise<void>((resolve, reject) => {
      const candidate: unknown = Reflect.construct(constructor, []);
      if (!isBrowserRequest(candidate)) throw refused(0);
      const xhr = candidate;
      let settled = false;
      const cleanup = () => signal.removeEventListener('abort', aborted);
      const finish = (error?: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error === undefined) resolve();
        else reject(error);
      };
      const aborted = () => {
        finish(signal.reason);
        xhr.abort();
      };
      xhr.open('PUT', url);
      xhr.withCredentials = false;
      for (const [name, value] of Object.entries(signed)) xhr.setRequestHeader(name, value);
      xhr.upload.addEventListener('progress', (event) => {
        if (!('loaded' in event) || typeof event.loaded !== 'number') return;
        try {
          progress?.({
            phase: 'uploading',
            loaded: Math.min(event.loaded, file.size),
            total: file.size,
          });
        } catch (error) {
          finish(error ?? refused(0));
          xhr.abort();
        }
      });
      xhr.addEventListener(
        'load',
        () => finish(xhr.status >= 200 && xhr.status < 300 ? undefined : refused(xhr.status)),
        { once: true },
      );
      xhr.addEventListener('error', () => finish(refused(0)), { once: true });
      xhr.addEventListener('abort', () => finish(signal.aborted ? signal.reason : refused(0)), {
        once: true,
      });
      signal.addEventListener('abort', aborted, { once: true });
      if (signal.aborted) aborted();
      else xhr.send(file);
    });
  } else {
    let response: Response;
    try {
      response = await send(url, {
        method: 'PUT',
        headers: signed,
        body: file,
        signal,
        credentials: 'omit',
        redirect: 'error',
      });
    } catch {
      if (signal.aborted) throw signal.reason;
      throw refused(0);
    }
    void response.body?.cancel().catch(() => {});
    if (!response.ok) throw refused(response.status);
  }
  signal.throwIfAborted();
  progress?.({ phase: 'uploading', loaded: file.size, total: file.size });
}
