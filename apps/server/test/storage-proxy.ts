import { garageStorageConfig } from '../../../scripts/test/garage.ts';

/** Real Garage behind a controllable provider outage; preserve signed Host and body headers. */
export function createStorageProxy() {
  let unavailable = false;
  let headDelayMs = 0;
  const backend = new URL(garageStorageConfig.endpoint);
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      if (unavailable)
        return new Response('<Error><Code>ServiceUnavailable</Code></Error>', {
          status: 503,
          headers: { 'content-type': 'application/xml' },
        });
      if (request.method === 'HEAD' && headDelayMs)
        await new Promise((resolve) => setTimeout(resolve, headDelayMs));
      const target = new URL(request.url);
      target.host = backend.host;
      target.protocol = backend.protocol;
      return fetch(target, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        redirect: 'manual',
      });
    },
  });
  return {
    endpoint: server.url.origin,
    delayHeads(ms: number) {
      headDelayMs = ms;
    },
    unavailable(value: boolean) {
      unavailable = value;
    },
    close: () => server.stop(true),
  };
}
