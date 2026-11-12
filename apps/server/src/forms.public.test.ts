import { expect, test } from 'bun:test';

import { problemDetailsSchema } from '@backbricks/core';
import { createWithTenant } from '@backbricks/db';
import { submissionAcceptedSchema } from '@backbricks/module-forms';

import { available, scenario } from '../test/auth-fixture.ts';
import { createFormFixture, solvedProof, validAnswers } from '../test/forms-fixture.ts';
import { prepareIsolationFixture } from '../test/isolation/setup.ts';
import { issueKey } from '../test/platform-read-fixture.ts';

test.skipIf(!available)(
  'public form schema and JSON submissions go through the shared guard atomically',
  async () => {
    await scenario(async (base) => {
      const f = await prepareIsolationFixture(base);
      const { key, publishable } = await createFormFixture(f);
      const bearer = { authorization: `Bearer ${publishable}` };
      const path = `/v1/public/forms/${key}`;
      const tenant = { organizationId: f.organizationId, projectId: f.a1.id };
      const entries = () =>
        createWithTenant(f.db)(tenant, async (tx) => {
          const rows = await tx.repositories.events.pending(100);
          return rows.filter((row) => row.type === 'forms.submission.created').length;
        });

      // Public schema: only the allowlisted shape, briefly cacheable.
      const schema = await f.request(path, undefined, undefined, bearer);
      expect(schema.status).toBe(200);
      expect(schema.headers.get('cache-control')).toBe('public, max-age=60');
      expect(schema.headers.get('vary')?.toLowerCase().split(/,\s*/)).toContain('authorization');
      const body = await schema.json();
      expect(body).toEqual({
        key,
        proofOfWork: true,
        honeypotField: '_gotcha',
        fields: [
          { key: 'name', type: 'text', label: 'Name', required: true, maxLength: 100 },
          { key: 'email', type: 'email', label: 'Email', required: true },
          { key: 'message', type: 'textarea', label: 'Message', required: true, maxLength: 5000 },
          {
            key: 'privacy',
            type: 'consent',
            label: 'Privacy',
            required: true,
            consent: { text: 'I agree.', version: '2' },
          },
        ],
      });

      // A real browser flow: solve the proof, submit, get only an ID back.
      const submit = (data: unknown, extra: Record<string, unknown> = {}, headers = {}) =>
        f.request(`${path}/submissions`, { data, ...extra }, undefined, { ...bearer, ...headers });
      const accepted = await submit(validAnswers, { proof: await solvedProof(f, publishable) });
      expect(accepted.status).toBe(200);
      const { id } = submissionAcceptedSchema.parse(await accepted.json());
      expect(await entries()).toBe(1);

      // Without a proof the form rejects; the honeypot pretends success and stores nothing.
      expect((await submit(validAnswers)).status).toBe(400);
      const trapped = await submit({ ...validAnswers, _gotcha: 'bot' });
      expect(trapped.status).toBe(200);
      expect(await trapped.json()).toEqual({ accepted: true });
      expect(await entries()).toBe(1);

      // Validation problems name fields and codes, never values.
      const invalid = await submit(
        { name: '', email: 'nope', message: 'x', privacy: false, extra: 'secret-x' },
        { proof: await solvedProof(f, publishable) },
      );
      expect(invalid.status).toBe(422);
      const problem = problemDetailsSchema.parse(await invalid.json());
      expect(problem.errors?.map((entry) => `${entry.path}:${entry.code}`)).toEqual([
        'extra:unknown_field',
        'name:required',
        'email:invalid_email',
        'privacy:must_accept',
      ]);
      expect(problem.hint).toContain(`GET /v1/public/forms/${key}`);
      expect(JSON.stringify(problem)).not.toContain('secret-x');

      // Idempotency: the same key and body replay the same ID; a changed body conflicts.
      const proof = await solvedProof(f, publishable);
      const once = await submit(validAnswers, { proof }, { 'idempotency-key': 'retry-1' });
      const again = await submit(validAnswers, { proof }, { 'idempotency-key': 'retry-1' });
      expect(once.status).toBe(200);
      expect(await again.json()).toEqual(await once.json());
      expect(
        (
          await submit(
            { ...validAnswers, message: 'Changed' },
            { proof },
            { 'idempotency-key': 'retry-1' },
          )
        ).status,
      ).toBe(409);
      expect(await entries()).toBe(2);

      // Server-to-server: a secret key with forms:submit skips proof-of-work, but never from a browser.
      const secret = await issueKey(f, f.a1.id, {
        kind: 'secret',
        name: 'Server',
        scopes: ['forms:submit'],
        expiresAt: null,
      });
      const server = { authorization: `Bearer ${secret.token}` };
      expect(
        (await f.request(`${path}/submissions`, { data: validAnswers }, undefined, server)).status,
      ).toBe(200);
      const exposed = await f.request(`${path}/submissions`, { data: validAnswers }, undefined, {
        ...server,
        origin: 'https://evil.test',
      });
      expect(exposed.status).toBe(403);
      expect(problemDetailsSchema.parse(await exposed.json()).code).toBe('secret_key_exposed');

      // The stored entry is normalized, minimized and expires with the retention.
      const [row] = await f.db
        .execute<{
          data: Record<string, unknown>;
          subject_email: string;
          source: Record<string, unknown>;
          expires_at: Date;
          created_at: Date;
          spam_verdict: string;
        }>(
          `select data, subject_email, source, expires_at, created_at, spam_verdict from form_submissions where id = '${id}'`,
        )
        .then((result) => result.rows);
      expect(row?.data).toMatchObject({
        email: 'ada@example.com',
        privacy: { accepted: true, version: '2' },
      });
      expect(row?.subject_email).toBe('ada@example.com');
      // No raw IP, user agent, query string or path from a missing Referer.
      expect(Object.keys(row?.source ?? {}).toSorted()).toEqual(['ipHash', 'origin', 'uaFamily']);
      expect(row?.spam_verdict).toBe('clean');
      expect(
        (new Date(row!.expires_at).getTime() - new Date(row!.created_at).getTime()) / 86_400_000,
      ).toBe(180);

      // Concurrent retries serialize on the project and commit only one entry.
      const concurrent = await Promise.all(
        Array.from({ length: 3 }, () =>
          f.request(`${path}/submissions`, { data: validAnswers }, undefined, {
            ...server,
            'idempotency-key': 'concurrent',
          }),
        ),
      );
      expect(concurrent.map((response) => response.status)).toEqual([200, 200, 200]);
      const ids = await Promise.all(concurrent.map((response) => response.json()));
      expect(ids[1]).toEqual(ids[0]);
      expect(ids[2]).toEqual(ids[0]);

      // Forced outbox/usage failures roll back entries, events and accounting together.
      const snapshot = async () => ({
        rows: await f.db.execute(`select count(*)::int as n from form_submissions`),
        events: await entries(),
        usage: await f.db.execute(`select metric, value from usage_counters order by metric`),
      });
      const before = await snapshot();
      await f.db.execute(
        "alter table events add constraint fixture_forms_failure check (type <> 'forms.submission.created') not valid",
      );
      expect(
        (await f.request(`${path}/submissions`, { data: validAnswers }, undefined, server)).status,
      ).toBe(500);
      await f.db.execute('alter table events drop constraint fixture_forms_failure');
      expect(await snapshot()).toEqual(before);
      await f.db.execute(
        "alter table usage_counters add constraint fixture_forms_usage_failure check (metric <> 'forms.submissions') not valid",
      );
      expect(
        (await f.request(`${path}/submissions`, { data: validAnswers }, undefined, server)).status,
      ).toBe(500);
      await f.db.execute('alter table usage_counters drop constraint fixture_forms_usage_failure');
      expect(await snapshot()).toEqual(before);

      // Paused and archived forms are gone for the public.
      const manage = `/v1/projects/${f.a1.id}/forms/${key}`;
      expect(
        (
          await f.request(
            manage,
            { configVersion: 1, status: 'paused' },
            f.admin.cookie,
            undefined,
            'PATCH',
          )
        ).status,
      ).toBe(200);
      expect((await f.request(path, undefined, undefined, bearer)).status).toBe(404);
      expect(
        (await f.request(`${path}/submissions`, { data: validAnswers }, undefined, server)).status,
      ).toBe(404);
    });
  },
  60_000,
);

test.skipIf(!available)(
  'public schema reads stop at sixty per IP and form',
  async () => {
    await scenario(async (base) => {
      const f = await prepareIsolationFixture(base);
      const { key, publishable } = await createFormFixture(f);
      const statuses: number[] = [];
      for (let index = 0; index < 61; index++) {
        // oxlint-disable-next-line no-await-in-loop -- Exercise one client's sequential rate bucket.
        const response = await f.request(`/v1/public/forms/${key}?key=${publishable}`);
        statuses.push(response.status);
      }
      expect(statuses.slice(0, 60)).toEqual(Array.from({ length: 60 }, () => 200));
      expect(statuses[60]).toBe(429);
    });
  },
  30_000,
);

test.skipIf(!available)(
  'link-heavy entries are kept in the spam folder with a 30-day expiry',
  async () => {
    await scenario(async (base) => {
      const f = await prepareIsolationFixture(base);
      const { key } = await createFormFixture(f, 'contact', { retentionDays: null });
      const secret = await issueKey(f, f.a1.id, {
        kind: 'secret',
        name: 'Server',
        scopes: ['forms:submit'],
        expiresAt: null,
      });
      const links = Array.from({ length: 11 }, (_, index) => `https://spam.test/${index}`).join(
        ' ',
      );
      const response = await f.request(
        `/v1/public/forms/${key}/submissions`,
        { data: { ...validAnswers, message: links } },
        undefined,
        { authorization: `Bearer ${secret.token}` },
      );
      expect(response.status).toBe(200);
      const rows = (
        await f.db.execute<{ spam_verdict: string; days: number }>(
          `select spam_verdict, (extract(epoch from expires_at - created_at) / 86400)::int as days from form_submissions`,
        )
      ).rows;
      expect(rows).toEqual([{ spam_verdict: 'spam', days: 30 }]);
    });
  },
  30_000,
);
