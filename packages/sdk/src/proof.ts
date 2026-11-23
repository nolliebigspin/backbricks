import { isChallenge } from './challenge.ts';
import { unexpectedResponse } from './errors.ts';
import { solveProof } from './solve-proof.ts';
import type { Transport } from './transport.ts';
/** Every public write receives its own single-use proof; server credentials skip the challenge. */
export async function publicProof(transport: Transport, signal?: AbortSignal) {
  if (!transport.publishable) return undefined;
  const challenge = await transport.request(
    '/public/challenge',
    { method: 'GET', retry: false },
    signal,
  );
  if (!isChallenge(challenge)) throw unexpectedResponse();
  return { challenge, solution: await solveProof(challenge, signal) };
}
