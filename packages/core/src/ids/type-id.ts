/**
 * TypeIDs (ARCHITECTURE §B.1, AGENTS.md §5): `<prefix>_<26 chars>`, the suffix being a
 * UUIDv7 in Crockford base32 (https://github.com/jetify-com/typeid/tree/main/spec).
 * Sortable by creation time and self-describing in logs. Generated only through `Ids`.
 */
import type { Clock } from '../time/clock.ts';

export const ID_PREFIXES = [
  'prj',
  'key',
  'mod',
  'rvn',
  'sub',
  'file',
  'rev',
  'evt',
  'aud',
  'ntf',
  'req',
] as const;

export type IdPrefix = (typeof ID_PREFIXES)[number];
export type TypeId<P extends IdPrefix = IdPrefix> = `${P}_${string}`;

export type Ids = { generate<P extends IdPrefix>(prefix: P): TypeId<P> };

const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';
const SUFFIX = /^[0-7][0-9a-hjkmnp-tv-z]{25}$/;

function encodeBase32(bytes: Uint8Array): string {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  let out = '';
  // 26 characters × 5 bits = 130 bits: the 128-bit value with two leading zero bits.
  for (let index = 25; index >= 0; index--) {
    out += ALPHABET[Number((value >> BigInt(index * 5)) & 31n)];
  }
  return out;
}

function decodeBase32(suffix: string): Uint8Array {
  let value = 0n;
  for (const char of suffix) value = (value << 5n) | BigInt(ALPHABET.indexOf(char));
  const bytes = new Uint8Array(16);
  for (let index = 15; index >= 0; index--) {
    bytes[index] = Number(value & 0xffn);
    value >>= 8n;
  }
  return bytes;
}

/** UUIDv7 bytes: 48-bit Unix milliseconds, version 7, variant 10, random rest (RFC 9562). */
function uuidV7Bytes(milliseconds: number, random: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(16);
  bytes.set(random.subarray(0, 10), 6);
  let time = BigInt(milliseconds);
  for (let index = 5; index >= 0; index--) {
    bytes[index] = Number(time & 0xffn);
    time >>= 8n;
  }
  bytes[6] = 0x70 | ((bytes[6] ?? 0) & 0x0f);
  bytes[8] = 0x80 | ((bytes[8] ?? 0) & 0x3f);
  return bytes;
}

export function createIds(
  clock: Clock,
  fillRandom: (bytes: Uint8Array) => void = (bytes) => crypto.getRandomValues(bytes),
): Ids {
  return {
    generate(prefix) {
      const random = new Uint8Array(10);
      fillRandom(random);
      return `${prefix}_${encodeBase32(uuidV7Bytes(clock.now().getTime(), random))}`;
    },
  };
}

function isIdPrefix(value: string): value is IdPrefix {
  return (ID_PREFIXES as readonly string[]).includes(value);
}

/** Splits a TypeID; `null` if the value isn't one of ours. */
export function parseTypeId(value: string): { prefix: IdPrefix; uuid: string } | null {
  const separator = value.lastIndexOf('_');
  const prefix = value.slice(0, separator);
  const suffix = value.slice(separator + 1);
  if (!isIdPrefix(prefix) || !SUFFIX.test(suffix)) return null;
  const hex = [...decodeBase32(suffix)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  return { prefix, uuid };
}

export function isTypeId<P extends IdPrefix>(value: unknown, prefix: P): value is TypeId<P> {
  return typeof value === 'string' && parseTypeId(value)?.prefix === prefix;
}
