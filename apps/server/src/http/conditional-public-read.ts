import type { RegisteredRoute } from '@backbricks/core';

export const IF_NONE_MATCH = 'if-none-match';

export function isConditionalPublicRead(route: RegisteredRoute): boolean {
  return (
    route.method === 'GET' &&
    route.access?.kind === 'read' &&
    route.responses[304]?.kind === 'empty'
  );
}

function matchesValidator(value: string | undefined, opaqueTag: string): boolean {
  if (!value) return false;
  if (value.trim() === '*') return true;
  // A comma can occur inside a quoted entity tag, so split only at token boundaries.
  const token = /[ \t]*(?:(?:W\/)?"([\x21\x23-\x7e\x80-\xff]*)"[ \t]*)?(,|$)/gy;
  let matched = false;
  while (token.lastIndex < value.length) {
    const match = token.exec(value);
    if (!match || match[0].length === 0) return false;
    matched ||= match[1] === opaqueTag;
  }
  return matched;
}

/** Revalidate against the exact JSON that passed the module's response allowlist. */
export async function conditionalPublicResponse(response: Response, validator: string | undefined) {
  const bytes = await response.arrayBuffer();
  const tag = new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
  const headers = new Headers(response.headers);
  headers.set('ETag', `W/"${tag}"`);
  headers.set('Access-Control-Expose-Headers', 'ETag');
  if (matchesValidator(validator, tag)) {
    headers.delete('Content-Type');
    headers.delete('Content-Length');
    return new Response(null, { status: 304, headers });
  }
  return new Response(bytes, { status: response.status, headers });
}
