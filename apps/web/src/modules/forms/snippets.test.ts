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

test('the SDK script reads every field from its form and keeps secrets out of website code', () => {
  const { sdkForm, sdk, server } = formSnippets(input);
  expect(sdkForm).toContain('<form id="backbricks-contact">');
  expect(sdkForm).toContain('  <output></output>');
  expect(sdk).toContain("publishableKey: 'bb_pk_test',");
  expect(sdk).toContain("const form = document.getElementById('backbricks-contact');");
  expect(sdk).toContain("      'contact',");
  expect(sdk).toContain("        name: text('name'),");
  expect(sdk).toContain("        privacy: fields.has('privacy'),");
  expect(sdk).toContain("        source: text('source'),");
  expect(sdk).toContain("      { honeypot: text('_gotcha') },");
  expect(sdk).not.toContain('innerHTML');
  expect(server).toContain('process.env.BACKBRICKS_SECRET_KEY');
  expect(server).toContain("topic: 'sales',");
  expect(server).not.toContain('source:');
  expect(server).not.toContain('bb_pk_test');
});

test('quotes in the API address cannot break out of the generated strings', () => {
  const { sdk, server } = formSnippets({ ...input, baseUrl: "https://x.test/it's/v1" });
  expect(sdk).toContain("baseUrl: 'https://x.test/it\\'s/v1',");
  expect(server).toContain("fetch('https://x.test/it\\'s/v1/public/forms/contact/submissions', {");
});

test('without a publishable key the code shows a placeholder', () => {
  const { html, sdk } = formSnippets({ ...input, publishableKey: null });
  expect(html).toContain(`?key=${PUBLISHABLE_KEY_PLACEHOLDER}`);
  expect(sdk).toContain(PUBLISHABLE_KEY_PLACEHOLDER);
});
