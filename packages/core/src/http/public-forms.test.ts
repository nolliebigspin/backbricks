import { expect, test } from 'bun:test';

import * as fc from 'fast-check';

import { AppError } from '../errors/app-error.ts';
import { publicFormFailure, publicFormRedirect } from './public-forms.ts';

test('redirects require an exact current allowed origin and a safe absolute URL', () => {
  expect(publicFormRedirect('https://site.test/thanks?x=1', ['https://site.test'])).toBe(
    'https://site.test/thanks?x=1',
  );
  expect(publicFormRedirect('http://localhost:4000/thanks', ['http://localhost:4000'])).toBe(
    'http://localhost:4000/thanks',
  );
  for (const url of [
    '//site.test/thanks',
    'javascript:alert(1)',
    'https://site.test@evil.test/',
    'https://user:pass@site.test/',
    'https://site.test.evil.test/',
    'https://site.test:4430/',
    'http://site.test/',
    'https://site.test/\r\nx-header: yes',
  ]) {
    expect(publicFormRedirect(url, ['https://site.test'])).toBeUndefined();
  }
  expect(publicFormRedirect('https://site.test/thanks', [])).toBeUndefined();
  fc.assert(
    fc.property(fc.string(), (value) => {
      const result = publicFormRedirect(value, ['https://site.test']);
      if (!result) return;
      const url = new URL(result);
      expect(url.origin).toBe('https://site.test');
      expect(url.username).toBe('');
      expect(url.password).toBe('');
      expect(url.hash).toBe('');
      expect(result).not.toMatch(/[\r\n]/);
    }),
  );
  fc.assert(
    fc.property(fc.domain(), (host) => {
      if (host === 'site.test') return;
      expect(publicFormRedirect(`https://${host}/thanks`, ['https://site.test'])).toBeUndefined();
    }),
  );
});

test('HTML errors escape field paths and never render values or arbitrary details', async () => {
  const error = new AppError('validation_failed', {
    detail: 'private-value',
    errors: [{ path: '<script>"&', code: 'required', message: 'private-value' }],
  });
  const html = publicFormFailure(error);
  expect(html.status).toBe(422);
  expect(html.headers.get('content-security-policy')).toBe("default-src 'none'");
  const body = await html.text();
  expect(body).toContain('&lt;script&gt;&quot;&amp;');
  expect(body).not.toContain('<script>');
  expect(body).not.toContain('private-value');
  const response = publicFormFailure(error, { error: 'https://site.test/error?from=form' });
  expect(response.status).toBe(303);
  const target = new URL(response.headers.get('location')!);
  expect(target.searchParams.get('error')).toBe('validation_failed');
  expect(target.searchParams.get('fields')).toBe('<script>"&');
  expect(target.searchParams.get('from')).toBe('form');
  expect(target.href).not.toContain('private-value');
  const secret = `bb_sk_${'a'.repeat(32)}`;
  const sensitive = new AppError('validation_failed', {
    errors: [{ path: secret, code: 'unknown_field', message: 'Invalid field.' }],
  });
  expect(await publicFormFailure(sensitive).text()).not.toContain(secret);
  expect(
    publicFormFailure(sensitive, { error: 'https://site.test/error' }).headers.get('location'),
  ).not.toContain(secret);
  expect(publicFormRedirect(`https://site.test/${secret}`, ['https://site.test'])).toBeUndefined();
});
