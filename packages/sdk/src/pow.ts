/**
 * Proof-of-work solver for the server's ALTCHA v2 challenges (SHA family, `uint32` counter):
 * the key is `salt ‖ nonce ‖ counter` hashed `cost` times; the first counter whose key starts
 * with `keyPrefix` solves it. WebCrypto only, so it runs in browsers, Node ≥ 20 and Bun without
 * dependencies. A web-worker variant follows with the full SDK (P5.1).
 */
export type Challenge = {
  parameters: {
    algorithm: string;
    nonce: string;
    salt: string;
    cost: number;
    keyLength?: number;
    keyPrefix: string;
    expiresAt?: number;
  };
  signature?: string;
};
export type Solution = { counter: number; derivedKey: string; time: number };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Shape check for challenges from the network; the solver validates the values. */
export function isChallenge(value: unknown): value is Challenge {
  if (!isRecord(value) || !isRecord(value['parameters'])) return false;
  const parameters = value['parameters'];
  return (
    ['algorithm', 'nonce', 'salt', 'keyPrefix'].every(
      (name) => typeof parameters[name] === 'string',
    ) && typeof parameters['cost'] === 'number'
  );
}

const ALGORITHMS = new Set(['SHA-256', 'SHA-384', 'SHA-512']);
const HEX = /^(?:[0-9a-f]{2})+$/i;
const MAX_COUNTER = 0xffffffff;
// The server accepts solving times up to its challenge lifetime.
const MAX_TIME_MS = 600_000;

function bytes(hex: string): Uint8Array<ArrayBuffer> {
  if (!HEX.test(hex)) throw new TypeError('Invalid proof-of-work challenge.');
  const out = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let index = 0; index < out.length; index += 1)
    out[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  return out;
}
const toHex = (value: Uint8Array) =>
  Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('');

/** The derived key for one counter, exactly as the server recomputes it. */
export async function deriveKey(challenge: Challenge, counter: number): Promise<Uint8Array> {
  const { algorithm, cost, keyLength = 32 } = challenge.parameters;
  const salt = bytes(challenge.parameters.salt);
  const nonce = bytes(challenge.parameters.nonce);
  const input = new Uint8Array(new ArrayBuffer(salt.length + nonce.length + 4));
  input.set(salt);
  input.set(nonce, salt.length);
  new DataView(input.buffer).setUint32(salt.length + nonce.length, counter, false);
  let key = input;
  for (let round = 0; round < Math.max(1, cost); round += 1)
    // oxlint-disable-next-line no-await-in-loop -- Each round hashes the previous digest.
    key = new Uint8Array(await crypto.subtle.digest(algorithm, key));
  return key.slice(0, keyLength);
}

export async function solveChallenge(
  challenge: Challenge,
  options: { signal?: AbortSignal } = {},
): Promise<Solution> {
  const { algorithm, keyPrefix, cost } = challenge.parameters;
  if (!ALGORITHMS.has(algorithm) || !/^[0-9a-f]+$/i.test(keyPrefix) || !(cost >= 1))
    throw new TypeError('Unsupported proof-of-work challenge.');
  const prefix = keyPrefix.toLowerCase();
  const start = performance.now();
  for (let counter = 0; counter <= MAX_COUNTER; counter += 1) {
    options.signal?.throwIfAborted();
    // oxlint-disable-next-line no-await-in-loop -- Counters are tried in order until one fits.
    const key = toHex(await deriveKey(challenge, counter));
    if (key.startsWith(prefix))
      return {
        counter,
        derivedKey: key,
        time: Math.min(Math.round(performance.now() - start), MAX_TIME_MS),
      };
  }
  throw new TypeError('Proof-of-work challenge has no solution.');
}
