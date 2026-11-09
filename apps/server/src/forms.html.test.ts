import { expect, test } from 'bun:test';

import { available, scenario } from '../test/auth-fixture.ts';
import { createFormFixture, solvedProof, validAnswers } from '../test/forms-fixture.ts';
import { prepareIsolationFixture } from '../test/isolation/setup.ts';

test.skipIf(!available)(
  'HTML posts share validation, proof, spam and atomic storage with JSON',
  async () => {
    await scenario(async (base) => {
      const f = await prepareIsolationFixture(base);
      const form = await createFormFixture(f, 'html', {
        redirects: {
          success: 'https://site.test/thanks',
          error: 'https://site.test/error?from=contact',
        },
        fields: [
          { key: 'name', type: 'text', label: 'Name', required: true },
          { key: 'email', type: 'email', label: 'Email', required: true, identifiesSubject: true },
          { key: 'privacy', type: 'consent', label: 'Privacy', text: 'I agree', version: '2' },
          { key: 'count', type: 'number', label: 'Count', required: true },
          {
            key: 'topics',
            type: 'multiselect',
            label: 'Topics',
            options: [
              { value: 'a', label: 'A' },
              { value: 'b', label: 'B' },
            ],
          },
        ],
      });
      expect(
        (
          await f.request(
            `/v1/projects/${f.a1.id}`,
            { allowedOrigins: ['https://site.test'] },
            f.admin.cookie,
            undefined,
            'PATCH',
          )
        ).status,
      ).toBe(200);
      const post = (values: URLSearchParams | string) =>
        fetch(`${f.origin}/v1/public/forms/${form.key}/submissions?key=${form.publishable}`, {
          method: 'POST',
          redirect: 'manual',
          headers: {
            origin: 'https://site.test',
            'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
          },
          body: values.toString(),
        });
      const proof = btoa(
        JSON.stringify(await solvedProof(f, form.publishable, { origin: 'https://site.test' })),
      );
      const body = new URLSearchParams([
        ['name', ' Ada '],
        ['email', 'Ada@Example.com'],
        ['privacy', 'on'],
        ['count', '42'],
        ['topics', 'a'],
        ['topics', 'b'],
        ['altcha', proof],
      ]);
      const accepted = await post(body);
      expect(accepted.status).toBe(303);
      expect(accepted.headers.get('location')).toBe('https://site.test/thanks');
      expect(accepted.headers.get('access-control-allow-origin')).toBe('https://site.test');
      const rows = (await f.db.execute<{ data: unknown }>('select data from form_submissions'))
        .rows;
      expect(rows).toHaveLength(1);
      expect(rows[0]?.data).toMatchObject({
        name: 'Ada',
        email: 'ada@example.com',
        count: 42,
        topics: ['a', 'b'],
        privacy: { accepted: true, version: '2' },
      });
      const replay = await post(body);
      expect(replay.status).toBe(303);
      expect(new URL(replay.headers.get('location')!).searchParams.get('error')).toBe(
        'proof_invalid',
      );
      const trapped = await post('_gotcha=bot&altcha=bad');
      expect(trapped.status).toBe(303);
      expect(trapped.headers.get('location')).toBe('https://site.test/thanks');
      const invalid = await post(
        new URLSearchParams({
          name: '',
          email: 'private-invalid-value',
          count: 'bad',
          altcha: btoa(
            JSON.stringify(await solvedProof(f, form.publishable, { origin: 'https://site.test' })),
          ),
        }),
      );
      expect(invalid.status).toBe(303);
      const error = new URL(invalid.headers.get('location')!);
      expect(error.searchParams.get('error')).toBe('validation_failed');
      expect(error.searchParams.get('fields')).toBe('name,email,privacy,count');
      expect(error.href).not.toContain('private-invalid-value');
      expect(error.searchParams.get('from')).toBe('contact');
      expect(
        (await f.db.execute<{ data: unknown }>('select data from form_submissions')).rows,
      ).toHaveLength(1);

      // Origins changed after saving the form: configured redirects no longer authorize a POST.
      expect(
        (
          await f.request(
            `/v1/projects/${f.a1.id}`,
            { allowedOrigins: ['https://other.test'] },
            f.admin.cookie,
            undefined,
            'PATCH',
          )
        ).status,
      ).toBe(200);
      const stale = await fetch(
        `${f.origin}/v1/public/forms/${form.key}/submissions?key=${form.publishable}`,
        {
          method: 'POST',
          redirect: 'manual',
          headers: {
            origin: 'https://other.test',
            'content-type': 'application/x-www-form-urlencoded',
          },
          body: body.toString(),
        },
      );
      expect(stale.status).toBe(400);
      expect(stale.headers.get('location')).toBeNull();
      expect(await stale.text()).toContain('not configured for plain HTML submissions');
      expect(
        (await f.db.execute<{ data: unknown }>('select data from form_submissions')).rows,
      ).toHaveLength(1);
    });
  },
  60_000,
);

test.skipIf(!available)(
  'HTML failure pages cover auth, size, validation and missing redirect configuration safely',
  async () => {
    await scenario(async (base) => {
      const f = await prepareIsolationFixture(base);
      const { key, publishable } = await createFormFixture(f, 'html', {
        spam: { proofOfWork: false },
        redirects: { success: 'https://site.test/thanks' },
      });
      expect(
        (
          await f.request(
            `/v1/projects/${f.a1.id}`,
            { allowedOrigins: ['https://site.test'] },
            f.admin.cookie,
            undefined,
            'PATCH',
          )
        ).status,
      ).toBe(200);
      const post = (body: string, token = publishable) =>
        fetch(`${f.origin}/v1/public/forms/${key}/submissions?key=${token}`, {
          method: 'POST',
          redirect: 'manual',
          headers: {
            origin: 'https://site.test',
            'content-type': 'application/x-www-form-urlencoded',
          },
          body,
        });
      const invalid = await post(
        new URLSearchParams({
          ...validAnswers,
          privacy: 'false',
          name: '',
          '<script>': 'submitted-secret',
        }).toString(),
      );
      expect(invalid.status).toBe(422);
      expect(invalid.headers.get('content-type')).toContain('text/html');
      expect(invalid.headers.get('content-security-policy')).toBe("default-src 'none'");
      const html = await invalid.text();
      expect(html).toContain('&lt;script&gt;');
      expect(html).not.toContain('<script>');
      expect(html).not.toContain('submitted-secret');
      expect(html).toContain('href="https://site.test/"');
      expect((await post('message=' + 'x'.repeat(65_536))).status).toBe(413);
      const unauthenticated = await post('name=submitted-secret', 'invalid');
      expect(unauthenticated.status).toBe(422);
      expect(unauthenticated.headers.get('content-security-policy')).toBe("default-src 'none'");
      expect(await unauthenticated.text()).not.toContain('submitted-secret');
      const unconfigured = await createFormFixture(f, 'no-redirect');
      const missing = await fetch(
        `${f.origin}/v1/public/forms/no-redirect/submissions?key=${unconfigured.publishable}`,
        {
          method: 'POST',
          redirect: 'manual',
          headers: {
            origin: 'https://site.test',
            'content-type': 'application/x-www-form-urlencoded',
          },
          body: 'name=private',
        },
      );
      expect(missing.status).toBe(400);
      expect(await missing.text()).toContain('not configured for plain HTML submissions');
      expect(
        (await f.db.execute<{ data: unknown }>('select data from form_submissions')).rows,
      ).toHaveLength(0);
    });
  },
  30_000,
);
