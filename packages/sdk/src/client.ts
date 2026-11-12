import { createForms, type FormsClient } from './forms.ts';
import { createTransport, type ClientOptions } from './transport.ts';

export type { ClientOptions } from './transport.ts';
export type Client<Schema> = { forms: FormsClient<Schema> };

export function createClientFor<Schema>(options: ClientOptions): Client<Schema> {
  const transport = createTransport(options);
  return { forms: createForms<Schema>(transport) };
}
