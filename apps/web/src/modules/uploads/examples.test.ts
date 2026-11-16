import { expect, test } from 'bun:test';

import en from '../../i18n/en.json';
import { uploadApplicationSnippets } from './application-snippets.ts';
const example = (name: string) =>
  Bun.file(new URL(`../../../../../examples/html/${name}`, import.meta.url));
test('the attachment example is exactly the localized dashboard code and keeps references in memory', async () => {
  const snippets = uploadApplicationSnippets(
    {
      baseUrl: 'http://localhost:5173/v1',
      publishableKey: null,
      zoneKey: 'cv',
      formKey: 'application',
    },
    en.uploads.example,
  );
  expect(await example('upload.html').text()).toContain(snippets.form);
  expect(await example('upload.js').text()).toBe(snippets.script);
  expect(snippets.script).not.toContain('localStorage');
  expect(snippets.script).not.toContain('secretKey');
  expect(snippets.script).toContain('uploaded.file !== selectedFile');
  expect(snippets.script).toContain('idempotencyKey: requestKey');
});
test('untrusted snippet values cannot escape HTML or JavaScript literals', () => {
  const snippets = uploadApplicationSnippets(
    {
      baseUrl: "https://example.test/';\nthrow new Error('injected')",
      publishableKey: null,
      zoneKey: "cv'",
      formKey: 'application',
    },
    { ...en.uploads.example, email: '<img onerror=alert(1)>', sent: "Saved';\nthrow 1;//" },
  );
  expect(snippets.form).not.toContain('<img');
  expect(snippets.form).toContain('&lt;img');
  expect(() => new Bun.Transpiler({ loader: 'js' }).transformSync(snippets.script)).not.toThrow();
});
