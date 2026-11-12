import { expect, test } from 'bun:test';

import { configFields } from './entries-view.ts';
import { formSnippets, PUBLISHABLE_KEY_PLACEHOLDER } from './snippets.ts';

/** `examples/html` is the Embed tab's code for its form, before the owner fills in key and URL. */
const example = (name: string) =>
  Bun.file(new URL(`../../../../../examples/html/${name}`, import.meta.url));
const EXAMPLE_BASE_URL = 'http://localhost:5173/v1';

test('examples/html contains exactly the snippets the dashboard shows for its form', async () => {
  const fields = configFields(await example('form.json').json());
  expect(fields.length).toBeGreaterThan(0);
  const input = {
    baseUrl: EXAMPLE_BASE_URL,
    publishableKey: null,
    honeypotField: '_gotcha',
    fields,
  };
  const plain = formSnippets({ ...input, formKey: 'contact-plain' });
  const sdk = formSnippets({ ...input, formKey: 'contact' });
  expect(await example('index.html').text()).toContain(plain.html);
  expect(await example('sdk.html').text()).toContain(sdk.sdkForm);
  expect(await example('sdk.js').text()).toBe(sdk.sdk);
  expect(plain.html).toContain(PUBLISHABLE_KEY_PLACEHOLDER);
});
