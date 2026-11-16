import { expect, test } from 'bun:test';

import { uploadSnippets } from './snippets.ts';
test('upload instructions quote keys and URLs and keep secret keys out of browser code', () => {
  const snippets = uploadSnippets({
    baseUrl: 'https://example.test/";alert(1)//',
    publishableKey: null,
    zoneKey: 'cv',
  });
  expect(snippets.browser).toContain('client.uploads.upload("cv", selectedFile)');
  expect(snippets.browser).toContain('YOUR_PUBLISHABLE_KEY');
  expect(snippets.browser).not.toContain('secretKey');
  expect(snippets.server).toContain('process.env.BACKBRICKS_SECRET_KEY');
  expect(snippets.browser).toContain('\\";alert(1)//');
});
