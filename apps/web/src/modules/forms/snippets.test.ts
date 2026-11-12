import { expect, test } from 'bun:test';

import { formSnippets, PUBLISHABLE_KEY_PLACEHOLDER } from './snippets.ts';

const input = {
  baseUrl: 'https://api.example.com/v1',
  publishableKey: 'bb_pk_test',
  formKey: 'contact',
  honeypotField: '_gotcha',
  fields: [
    { key: 'name', type: 'text', label: '<b>Name</b>', required: true },
    { key: 'email', type: 'email', label: 'Email' },
    {
      key: 'topic',
      type: 'select',
      label: 'Topic',
      options: [{ value: 'sales', label: 'Sales & "more"' }],
    },
    { key: 'privacy', type: 'consent', label: 'Privacy', text: 'I agree <now>' },
    { key: 'source', type: 'hidden', label: 'Source' },
  ],
};

test('the HTML form posts to the form with the publishable key and escapes config text', () => {
  const { html } = formSnippets(input);
  expect(html).toContain(
    '<form method="post" action="https://api.example.com/v1/public/forms/contact/submissions?key=bb_pk_test">',
  );
  expect(html).toContain('&lt;b&gt;Name&lt;/b&gt;');
  expect(html).toContain('<input type="text" name="name" required>');
  expect(html).toContain('<option value="sales">Sales &amp; &quot;more&quot;</option>');
  expect(html).toContain('name="privacy" required> I agree &lt;now&gt;');
  expect(html).toContain('<input name="_gotcha" tabindex="-1" autocomplete="off">');
  expect(html).not.toContain('<b>');
});

test('SDK and server code use the form key; secrets stay in an environment variable', () => {
  const { sdk, server } = formSnippets(input);
  expect(sdk).toContain("publishableKey: 'bb_pk_test',");
  expect(sdk).toContain("await backbricks.forms.submit('contact', {");
  expect(sdk).toContain("topic: 'sales',");
  expect(sdk).toContain('privacy: true,');
  expect(sdk).not.toContain('source:');
  expect(server).toContain('process.env.BACKBRICKS_SECRET_KEY');
  expect(server).not.toContain('bb_pk_test');
});

test('without a publishable key the code shows a placeholder', () => {
  const { html, sdk } = formSnippets({ ...input, publishableKey: null });
  expect(html).toContain(`?key=${PUBLISHABLE_KEY_PLACEHOLDER}`);
  expect(sdk).toContain(PUBLISHABLE_KEY_PLACEHOLDER);
});
