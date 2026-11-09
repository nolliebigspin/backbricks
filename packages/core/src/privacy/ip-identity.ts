import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';

import { AppError } from '../errors/app-error.ts';
import type { Clock } from '../time/clock.ts';

const MAX_FORWARDED_LENGTH = 4096;
const MAX_PROXY_HOPS = 32;

/** Canonicalize only literal addresses; hostnames, ports and IPv6 zone IDs are rejected. */
export function canonicalIp(input: string): string | null {
  if (input.includes('%')) return null;
  const family = isIP(input);
  if (family === 4) return input;
  if (family !== 6) return null;
  const address = new URL(`http://[${input}]`).hostname.slice(1, -1);
  // IPv4 and its IPv6-mapped representation must share one abuse identity.
  const mapped = /^::ffff:([0-9a-f]+):([0-9a-f]+)$/.exec(address);
  if (mapped?.[1] && mapped[2]) {
    const high = Number.parseInt(mapped[1], 16);
    const low = Number.parseInt(mapped[2], 16);
    return [high >> 8, high & 255, low >> 8, low & 255].join('.');
  }
  return address;
}

/** Resolve right-to-left from the socket peer, stopping at the first untrusted hop. */
export function resolveClientIp(
  peer: string | undefined,
  forwardedFor: string | null,
  trustedProxies: ReadonlySet<string>,
): string | null {
  let address = peer ? canonicalIp(peer) : null;
  if (!address || !trustedProxies.has(address) || !forwardedFor) return address;
  if (forwardedFor.length > MAX_FORWARDED_LENGTH) return address;
  const hops = forwardedFor.split(',');
  if (hops.length > MAX_PROXY_HOPS) return address;
  for (const hop of hops.toReversed()) {
    if (!trustedProxies.has(address)) break;
    const candidate = canonicalIp(hop.trim());
    if (!candidate) return peer ? canonicalIp(peer) : null;
    address = candidate;
  }
  return address;
}

/** Hash at the request edge; never return or retain the resolved clear-text address. */
export function createIpIdentity(options: {
  appSecret: string;
  clock: Clock;
  trustedProxies: readonly string[];
}): (peer: string | undefined, headers: Headers) => string {
  const trusted = new Set<string>();
  for (const proxy of options.trustedProxies) {
    const normalized = canonicalIp(proxy);
    if (!normalized) throw new AppError('internal_error');
    trusted.add(normalized);
  }
  return (peer, headers) => {
    const address = resolveClientIp(peer, headers.get('x-forwarded-for'), trusted);
    if (!address)
      throw new AppError('service_unavailable', { detail: 'Client address unavailable.' });
    const day = options.clock.now().toISOString().slice(0, 10);
    const dailyKey = createHmac('sha256', options.appSecret)
      .update(`backbricks.ip.v1:${day}`)
      .digest();
    return createHmac('sha256', dailyKey).update(address).digest('hex');
  };
}
