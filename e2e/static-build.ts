import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';

const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.txt': 'text/plain',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
};

export async function serveStaticBuild(directory: string, allowedOrigin?: string) {
  const origin = allowedOrigin ? new URL(allowedOrigin) : null;
  if (
    origin &&
    (origin.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(origin.hostname))
  )
    throw new Error('The fixture site requires a loopback HTTP origin.');
  const server = createServer((request, response) => {
    void (async () => {
      try {
        const path = new URL(request.url ?? '/', 'http://example.invalid').pathname;
        if (!/^\/[a-zA-Z0-9_./-]*$/.test(path) || path.split('/').includes('..'))
          throw new Error('Invalid fixture path.');
        const name = path.endsWith('/')
          ? `${path}index.html`
          : extname(path)
            ? path
            : `${path}.html`;
        const contents = await readFile(join(directory, name));
        response.setHeader('content-type', types[extname(name)] ?? 'application/octet-stream');
        response.end(contents);
      } catch {
        response.writeHead(404).end();
      }
    })();
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(origin ? Number(origin.port) || 80 : 0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a local address.');
  return {
    url: origin?.origin ?? `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}
