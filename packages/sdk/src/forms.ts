import type { operations } from '@backbricks/api-contract';

import { submitPublicData, type SubmitOptions } from './public-submit.ts';
import type { Transport } from './transport.ts';

/** `{ id }` for a stored entry; `{ accepted: true }` when the server dropped it as spam. */
export type SubmitResult =
  operations['forms.public.submit']['responses'][200]['content']['application/json'];
export type { SubmitOptions } from './public-submit.ts';

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

export function createForms<Schema>(transport: Transport): FormsClient<Schema> {
  return {
    submit: (key, data, options) =>
      submitPublicData(
        transport,
        `/public/forms/${encodeURIComponent(key)}/submissions`,
        data,
        options,
      ),
  };
}
