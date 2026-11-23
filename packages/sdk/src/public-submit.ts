import { unexpectedResponse } from './errors.ts';
import { publicProof } from './proof.ts';
import type { Transport } from './transport.ts';

export type SubmitOptions = {
  /** Retries with the same key return the first result. */
  idempotencyKey?: string;
  /** Value of a hidden honeypot input, if the integration renders one. */
  honeypot?: string;
  signal?: AbortSignal;
};

function isReceipt(value: unknown): value is { id: string } | { accepted: true } {
  if (typeof value !== 'object' || value === null) return false;
  return 'id' in value
    ? typeof value.id === 'string'
    : 'accepted' in value && value.accepted === true;
}

export async function submitPublicData(
  transport: Transport,
  path: string,
  data: unknown,
  options: SubmitOptions = {},
) {
  const { signal } = options;
  const proof = await publicProof(transport, signal);
  const result = await transport.request(
    path,
    {
      method: 'POST',
      body: { data, proof, honeypot: options.honeypot },
      headers:
        options.idempotencyKey === undefined ? {} : { 'Idempotency-Key': options.idempotencyKey },
    },
    signal,
  );
  if (!isReceipt(result)) throw unexpectedResponse();
  return result;
}
