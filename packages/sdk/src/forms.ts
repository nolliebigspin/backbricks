import type { operations } from '@backbricks/api-contract';

import { BackbricksError } from './errors.ts';
import { isChallenge, solveChallenge } from './pow.ts';
import type { Transport } from './transport.ts';

/** `{ id }` for a stored entry; `{ accepted: true }` when the server dropped it as spam. */
export type SubmitResult =
  operations['forms.public.submit']['responses'][200]['content']['application/json'];
export type SubmitOptions = {
  /** Retries with the same key return the first result instead of storing the entry twice. */
  idempotencyKey?: string;
  /** Value of your hidden honeypot input, if you render one; bots fill it, people don't. */
  honeypot?: string;
  signal?: AbortSignal;
};

/** Generated form types (`backbricks codegen`) when present, otherwise any field values. */
export type FormValues<Schema, Key extends string> = `forms/${Key}` extends keyof Schema
  ? Schema[`forms/${Key}`]
  : Record<string, unknown>;
export type FormsClient<Schema> = {
  submit<Key extends string>(
    key: Key,
    data: FormValues<Schema, Key>,
    options?: SubmitOptions,
  ): Promise<SubmitResult>;
};

const unexpected = () =>
  new BackbricksError({
    code: 'unexpected_response',
    status: 200,
    message: 'Backbricks sent a response this SDK version does not understand.',
  });
function isSubmitResult(value: unknown): value is SubmitResult {
  if (typeof value !== 'object' || value === null) return false;
  return 'id' in value
    ? typeof value.id === 'string'
    : 'accepted' in value && value.accepted === true;
}

export function createForms<Schema>(transport: Transport): FormsClient<Schema> {
  return {
    async submit(key, data, options = {}) {
      const { signal } = options;
      const proof = transport.publishable
        ? await (async () => {
            const challenge = await transport.request(
              '/public/challenge',
              { method: 'GET' },
              signal,
            );
            if (!isChallenge(challenge)) throw unexpected();
            return { challenge, solution: await solveChallenge(challenge, { signal }) };
          })()
        : undefined;
      const result = await transport.request(
        `/public/forms/${encodeURIComponent(key)}/submissions`,
        {
          method: 'POST',
          body: { data, proof, honeypot: options.honeypot },
          headers:
            options.idempotencyKey === undefined
              ? {}
              : { 'Idempotency-Key': options.idempotencyKey },
        },
        signal,
      );
      if (!isSubmitResult(result)) throw unexpected();
      return result;
    },
  };
}
