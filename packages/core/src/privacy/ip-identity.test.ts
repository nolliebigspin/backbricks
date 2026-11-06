import { describe, expect, test } from 'bun:test';

import { canonicalIp, createIpIdentity, resolveClientIp } from './ip-identity.ts';

describe('private client identity', () => {
  test('normalizes equivalent IPv6 and mapped IPv4; rejects non-addresses', () => {
    expect(canonicalIp('2001:0db8:0:0:0:0:0:1')).toBe('2001:db8::1');
    expect(canonicalIp('::ffff:192.0.2.1')).toBe('192.0.2.1');
    expect(canonicalIp('::ffff:c000:201')).toBe('192.0.2.1');
    for (const invalid of ['localhost', '192.0.2.1:80', '127.000.0.1', 'fe80::1%lo0', '[::1]']) {
      expect(canonicalIp(invalid)).toBeNull();
    }
  });

  test('ignores forwarding by default and stops at the first untrusted hop', () => {
    expect(resolveClientIp('192.0.2.1', '198.51.100.1', new Set())).toBe('192.0.2.1');
    const trusted = new Set(['127.0.0.1', '192.0.2.10']);
    expect(resolveClientIp('127.0.0.1', '198.51.100.1, 192.0.2.10', trusted)).toBe('198.51.100.1');
    expect(resolveClientIp('127.0.0.1', '203.0.113.1, 198.51.100.1', trusted)).toBe('198.51.100.1');
    expect(resolveClientIp('127.0.0.1', 'forged', trusted)).toBe('127.0.0.1');
    expect(resolveClientIp(undefined, '198.51.100.1', trusted)).toBeNull();
  });

  test('rotates at UTC midnight, separates installations and never returns the address', () => {
    let now = new Date('2026-11-06T23:59:59.999Z');
    const options = { appSecret: 'fixture-secret', clock: { now: () => now }, trustedProxies: [] };
    const identity = createIpIdentity(options);
    const first = identity('192.0.2.1', new Headers());
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toContain('192.0.2.1');
    expect(identity('::ffff:192.0.2.1', new Headers())).toBe(first);
    expect(identity('192.0.2.1', new Headers({ 'x-forwarded-for': '198.51.100.1' }))).toBe(first);
    expect(
      createIpIdentity({ ...options, appSecret: 'other-secret' })('192.0.2.1', new Headers()),
    ).not.toBe(first);
    now = new Date('2026-11-07T00:00:00.000Z');
    expect(identity('192.0.2.1', new Headers())).not.toBe(first);
    expect(() => identity(undefined, new Headers())).toThrow('Client address unavailable.');
  });
});
