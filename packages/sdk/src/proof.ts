import { unexpectedResponse } from './errors.ts';
import { isChallenge, solveChallenge } from './pow.ts';
import type { Transport } from './transport.ts';
/** Every public write receives its own single-use proof; server credentials skip the challenge. */
export async function publicProof(transport: Transport, signal?: AbortSignal) {
  if (!transport.publishable) return undefined;
  const challenge = await transport.request('/public/challenge', { method: 'GET' }, signal);
  if (!isChallenge(challenge)) throw unexpectedResponse();
  return { challenge, solution: await solveChallenge(challenge, { signal }) };
}
