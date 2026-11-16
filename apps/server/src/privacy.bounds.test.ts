import { expect, test } from 'bun:test';

import { createIds, SUBJECT_EXPORT_LIMITS } from '@backbricks/core';
import { unzipSync } from 'fflate';
import { z } from 'zod';

import { available, scenario } from '../test/auth-fixture.ts';
import { createFormFixture, createSubmissionFixture } from '../test/forms-fixture.ts';
import { prepareIsolationFixture } from '../test/isolation/setup.ts';

test.skipIf(!available)(
  'forms-only ZIP needs no storage and subject JSON fails explicitly instead of truncating record 10001',
  async () => {
    await scenario(
      async (base) => {
        const f = await prepareIsolationFixture(base);
        const { key } = await createFormFixture(f);
        const seed = await createSubmissionFixture(f, key);
        const root = `/v1/projects/${f.a1.id}/privacy`;
        const body = { email: 'ADA@example.com' };
        const zip = await f.request(`${root}/subject-export.zip`, body, f.admin.cookie);
        expect(zip.status).toBe(200);
        const contents = unzipSync(await zip.bytes());
        expect(Object.keys(contents)).toEqual(['manifest.json']);
        const manifest = z
          .object({
            modules: z.object({
              forms: z.object({ entries: z.array(z.object({ id: z.string() })) }),
            }),
            files: z.array(z.unknown()),
          })
          .parse(JSON.parse(new TextDecoder().decode(contents['manifest.json'])));
        expect(manifest.modules.forms.entries[0]?.id).toBe(seed);
        expect(manifest.files).toHaveLength(0);
        const ids = createIds({ now: f.now });
        const records = Array.from({ length: SUBJECT_EXPORT_LIMITS.records }, () => ({
          id: ids.generate('sub'),
        }));
        // Only server/core-generated fixture IDs enter this seed SQL.
        await f.db
          .execute(`insert into form_submissions (id, organization_id, project_id, instance_id, config_version, data, subject_email, source, search_vector, created_at, updated_at, expires_at)
      select input.id, original.organization_id, original.project_id, original.instance_id, original.config_version, original.data, original.subject_email, original.source, original.search_vector, original.created_at, original.updated_at, original.expires_at
      from jsonb_to_recordset('${JSON.stringify(records)}'::jsonb) as input(id text) cross join form_submissions original where original.id = '${seed}'`);
        const response = await f.request(`${root}/subject-export`, body, f.admin.cookie);
        expect(response.status).toBe(413);
        expect(z.object({ code: z.string() }).parse(await response.json()).code).toBe(
          'payload_too_large',
        );
        expect(
          (await f.db.execute<{ n: number }>('select count(*)::int as n from form_submissions'))
            .rows[0]?.n,
        ).toBe(SUBJECT_EXPORT_LIMITS.records + 1);
        expect(
          (
            await f.db.execute<{ n: number }>(
              "select count(*)::int as n from audit_logs where action = 'privacy.subject_exported'",
            )
          ).rows[0]?.n,
        ).toBe(2);

        const historical = ids.generate('mod');
        await f.db
          .execute(`insert into module_instances (id, organization_id, project_id, module_type, key, name, config, module_version, created_at, updated_at)
          values ('${historical}', '${f.organizationId}', '${f.a1.id}', 'uploads', 'historical', 'Historical', '{}', 1, now(), now())`);
        for (const operation of ['subject-export', 'subject-export.zip', 'subject-delete']) {
          // oxlint-disable-next-line no-await-in-loop -- Every privacy operation must reject disabled persisted modules before side effects.
          const blocked = await f.request(`${root}/${operation}`, body, f.admin.cookie);
          // oxlint-disable-next-line no-await-in-loop -- Consume the corresponding bounded problem response.
          const problem = await blocked.json();
          expect(z.object({ code: z.string() }).parse(problem).code).toBe('capability_unavailable');
        }
        expect(
          (
            await f.db.execute<{ n: number }>(
              "select count(*)::int as n from pgboss.job where name = 'core.privacy.erase'",
            )
          ).rows[0]?.n,
        ).toBe(0);
      },
      {},
      { durableDelivery: true, consumeJobs: false },
    );
  },
  30_000,
);
