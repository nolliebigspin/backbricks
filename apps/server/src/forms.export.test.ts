import { expect, test } from 'bun:test';

import { createIds, systemClock } from '@backbricks/core';

import { available, scenario } from '../test/auth-fixture.ts';
import { createFormFixture, createSubmissionFixture, validAnswers } from '../test/forms-fixture.ts';
import { prepareIsolationFixture } from '../test/isolation/setup.ts';
import { issueKey } from '../test/platform-read-fixture.ts';

const retainedMemory = () => {
  const usage = process.memoryUsage();
  return usage.heapUsed + usage.external;
};

test.skipIf(!available)(
  'CSV export is owner/admin-only, streams historical columns safely, audits and rate limits',
  async () => {
    await scenario(async (base) => {
      const f = await prepareIsolationFixture(base);
      const { key } = await createFormFixture(f);
      await createSubmissionFixture(f, key, {
        ...validAnswers,
        name: '=SUM(1)',
        message: 'a,"b"\nline',
      });
      const root = `/v1/projects/${f.a1.id}/forms/${key}`;
      expect(
        (
          await f.request(
            root,
            {
              configVersion: 1,
              config: { fields: [{ key: 'name', type: 'text', label: 'New name' }] },
            },
            f.admin.cookie,
            undefined,
            'PATCH',
          )
        ).status,
      ).toBe(200);
      await createSubmissionFixture(f, key, { name: 'Grace' });
      const path = `${root}/export.csv`;
      expect((await f.request(path, undefined, f.member.cookie)).status).toBe(403);
      const reader = await issueKey(f, f.a1.id, {
        kind: 'secret',
        name: 'Reader',
        scopes: ['data:read'],
        expiresAt: null,
      });
      expect(
        (await f.request(path, undefined, undefined, { authorization: `Bearer ${reader.token}` }))
          .status,
      ).toBe(403);
      const response = await f.request(path, undefined, f.owner.cookie);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-disposition')).toBe('attachment; filename="export.csv"');
      const csv = await response.text();
      expect(csv.split('\r\n')[0]).toContain('data.message');
      expect(csv).toContain("'=SUM(1)");
      expect(csv).toContain('"a,""b""\nline"');
      expect(csv).not.toContain('organization_id');
      expect((await f.request(path, undefined, f.owner.cookie)).status).toBe(429);
      const audit = await f.db.execute<{ changes: { count: number; reason: string } }>(
        "select changes from audit_logs where action = 'forms.submissions.exported' order by created_at, id",
      );
      expect(audit.rows.map((row) => row.changes)).toEqual([
        { count: 0, reason: 'started' },
        { count: 2, reason: 'completed' },
      ]);
    });
  },
  30_000,
);

test.skipIf(!available)(
  '50,000-entry CSV exports retain bounded memory and release page transactions',
  async () => {
    await scenario(async (base) => {
      const f = await prepareIsolationFixture(base);
      const { key } = await createFormFixture(f);
      const first = await createSubmissionFixture(f, key, {
        ...validAnswers,
        message: 'payload '.repeat(125),
      });
      const ids = createIds(systemClock);
      async function seed() {
        // Generated IDs and a real validated source row; no data or identifiers come from a client.
        const values = Array.from({ length: 49_999 }, () => `('${ids.generate('sub')}')`).join(',');
        const columns = [
          'organization_id',
          'project_id',
          'instance_id',
          'config_version',
          'data',
          'status',
          'read_at',
          'spam_verdict',
          'spam_reasons',
          'is_test',
          'subject_email',
          'source',
          'search_vector',
          'created_at',
          'updated_at',
          'expires_at',
        ];
        await f.db.execute(
          `insert into form_submissions (id, ${columns.join(',')}) select seed.id, ${columns.map((name) => `original.${name}`).join(',')} from (values ${values}) as seed(id) cross join form_submissions original where original.id = '${first}'`,
        );
      }
      await seed();
      Bun.gc(true);
      const baseline = retainedMemory();
      let peak = baseline,
        records = 0,
        chunks = 0,
        maxChunk = 0;
      const response = await f.request(
        `/v1/projects/${f.a1.id}/forms/${key}/export.csv`,
        undefined,
        f.owner.cookie,
      );
      expect(response.status).toBe(200);
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Expected a streaming response');
      const decoder = new TextDecoder();
      let trailingCR = '';
      for (;;) {
        // oxlint-disable-next-line no-await-in-loop -- Consume incrementally, without buffering the export in the test.
        const page = await reader.read();
        if (page.done) break;
        const text = trailingCR + decoder.decode(page.value, { stream: true });
        records += text.split('\r\n').length - 1;
        trailingCR = text.endsWith('\r') ? '\r' : '';
        maxChunk = Math.max(maxChunk, page.value.byteLength);
        if (++chunks % 25 === 0) {
          Bun.gc(true);
          peak = Math.max(peak, retainedMemory());
        }
      }
      expect(records).toBe(50_001);
      expect(maxChunk).toBeLessThan(1024 * 1024);
      expect(peak - baseline).toBeLessThan(40 * 1024 * 1024);
      const audit = await f.db.execute<{ changes: { count: number } }>(
        "select changes from audit_logs where action = 'forms.submissions.exported' and changes->>'reason' = 'completed'",
      );
      expect(audit.rows.map((row) => row.changes.count)).toEqual([50_000]);
    });
  },
  120_000,
);
