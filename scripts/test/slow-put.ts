import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

/** Hold a real signed PUT body open; status zero represents the expected transport abort. */
export function startSlowPut(
  url: string,
  headers: Record<string, string>,
  prefix: string | Uint8Array,
) {
  const protocol = new URL(url).protocol;
  if (!['http:', 'https:'].includes(protocol)) throw new Error('Expected an HTTP storage URL.');
  const response = Promise.withResolvers<number>();
  const started = Promise.withResolvers<void>();
  const send = protocol === 'https:' ? httpsRequest : httpRequest;
  const request = send(url, { method: 'PUT', headers }, (reply) => {
    reply.resume();
    reply.on('end', () => response.resolve(reply.statusCode ?? 0));
    reply.on('error', () => response.resolve(0));
  });
  request.on('error', () => {
    started.resolve();
    response.resolve(0);
  });
  request.setTimeout(20_000, () => request.destroy());
  request.write(prefix, () => started.resolve());
  return {
    started: started.promise,
    response: response.promise,
    finish(suffix: string | Uint8Array) {
      if (!request.writableEnded && !request.destroyed) request.end(suffix);
    },
    close: () => request.destroy(),
  };
}
