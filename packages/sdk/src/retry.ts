const transient = new Set([408, 429, 502, 503, 504]);
const MAX_DELAY_MS = 2_000;

export function retryDelay(response: Response | undefined): number | undefined {
  if (response && !transient.has(response.status)) return undefined;
  const header = response?.headers.get('Retry-After');
  if (!header) return 150;
  const seconds = /^\d+$/.test(header) ? Number(header) * 1_000 : Date.parse(header) - Date.now();
  if (!Number.isFinite(seconds)) return 150;
  return seconds > MAX_DELAY_MS ? undefined : Math.max(0, seconds);
}

export function delay(milliseconds: number, signal?: AbortSignal) {
  signal?.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, milliseconds);
    function abort() {
      clearTimeout(timer);
      reject(signal?.reason);
    }
    signal?.addEventListener('abort', abort, { once: true });
  });
}
