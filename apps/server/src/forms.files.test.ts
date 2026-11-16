import { expect, test } from 'bun:test';

import { AppError, defineModule, defineModuleCatalog, monthlyUsagePeriod } from '@backbricks/core';
import { createWithTenant } from '@backbricks/db';
import { createFormsModule } from '@backbricks/module-forms';
import { z } from 'zod';

import { available, scenario } from '../test/auth-fixture.ts';
import { createFormFixture, createSubmissionFixture } from '../test/forms-fixture.ts';
import { prepareIsolationFixture } from '../test/isolation/setup.ts';

test.skipIf(!available)(
  'optional file-owner cleanup shares the submission erasure transaction',
  async () => {
    const provider = defineModule({
      type: 'filefixture',
      moduleVersion: 1,
      displayName: { en: 'File fixture', de: 'Datei-Test' },
      resourceName: { singular: 'filefixture', plural: 'filefixtures' },
      infrastructure: [],
      configSchema: z.object({}).strict(),
      defaultConfig: () => ({}),
      scopes: [],
      events: [],
      usageMetrics: [
        {
          name: 'filefixture.deleted',
          kind: 'counter',
          unit: 'count',
          label: { en: 'Deleted', de: 'Gelöscht' },
        },
      ],
      provides: {
        files: (runtime) => ({
          claim: async () => {
            throw new AppError('capability_unavailable');
          },
          listByOwner: async () => [],
          syncOwnerExpiry: async () => {},
          async deleteByOwner(tx, owner) {
            expect(owner.type).toBe('form_submission');
            expect(owner.id).toStartWith('sub_');
            await runtime.services.usage.increment(tx, {
              metric: 'filefixture.deleted',
              delta: 1n,
            });
          },
        }),
      },
      retention: { purgeExpired: async () => 0, recomputeExpiry: async () => 0 },
      privacy: {
        exportSubject: async () => ({}),
        deleteSubject: async () => 0,
        eraseScope: async () => 0,
      },
    });
    await scenario(
      async (base) => {
        const f = await prepareIsolationFixture(base);
        const { key } = await createFormFixture(f);
        const id = await createSubmissionFixture(f, key);
        const path = `/v1/projects/${f.a1.id}/forms/${key}/submissions/${id}`;
        const usage = () =>
          createWithTenant(f.db)({ organizationId: f.organizationId, projectId: f.a1.id }, (tx) =>
            tx.repositories.usage.list(monthlyUsagePeriod(f.now())),
          );
        await f.db.execute(
          "alter table audit_logs add constraint fixture_forms_file_failure check (action <> 'forms.submission.deleted') not valid",
        );
        expect(
          (await f.request(path, undefined, f.member.cookie, undefined, 'DELETE')).status,
        ).toBe(500);
        await f.db.execute('alter table audit_logs drop constraint fixture_forms_file_failure');
        expect((await usage()).find((row) => row.metric === 'filefixture.deleted')).toBeUndefined();
        expect((await f.request(path, undefined, f.member.cookie)).status).toBe(200);
        expect(
          (await f.request(path, undefined, f.member.cookie, undefined, 'DELETE')).status,
        ).toBe(204);
        expect((await usage()).find((row) => row.metric === 'filefixture.deleted')?.value).toBe(1n);
      },
      { BACKBRICKS_MODULES: 'forms,filefixture' },
      { catalog: defineModuleCatalog([createFormsModule(), provider]) },
    );
  },
  30_000,
);

test.skipIf(!available)(
  'forms-only deployments read historical file configurations while rejecting new file configuration writes',
  async () => {
    await scenario(async (base) => {
      const f = await prepareIsolationFixture(base);
      const { key } = await createFormFixture(f);
      const id = await createSubmissionFixture(f, key);
      const path = `/v1/projects/${f.a1.id}/forms/${key}`;
      // A previously enabled provider may be absent at the next boot. Persisted shape remains valid.
      await f.db.execute(
        `update module_instances set config = jsonb_set(config, '{fields}', (config->'fields') || '[{"key":"cv","type":"file","label":"CV","zone":"cv","maxFiles":1,"required":false}]'::jsonb) where key = '${key}'`,
      );
      expect((await f.request(path, undefined, f.member.cookie)).status).toBe(200);
      expect(
        (await f.request(`${path}/submissions/${id}`, undefined, f.member.cookie)).status,
      ).toBe(200);
      expect(
        (
          await f.request(
            path,
            { configVersion: 1, name: 'Renamed' },
            f.admin.cookie,
            undefined,
            'PATCH',
          )
        ).status,
      ).toBe(200);
      const rejected = await f.request(
        path,
        { configVersion: 2, config: { retentionDays: 7 } },
        f.admin.cookie,
        undefined,
        'PATCH',
      );
      expect(rejected.status).toBe(422);
      expect(z.object({ code: z.string() }).parse(await rejected.json()).code).toBe(
        'capability_unavailable',
      );
    });
  },
  30_000,
);

test.skipIf(!available)(
  'project erasure fails before any deletion when a persisted module is disabled',
  async () => {
    await scenario(
      async (base) => {
        const f = await prepareIsolationFixture(base);
        const { key } = await createFormFixture(f);
        const id = await createSubmissionFixture(f, key);
        await f.db.execute(
          `insert into module_instances (id, organization_id, project_id, module_type, key, name, config, module_version, config_version, status, created_at, updated_at) select 'mod_disabled_fixture', organization_id, project_id, 'uploads', 'old-uploads', 'Old uploads', '{}'::jsonb, 1, 1, 'archived', created_at, updated_at from module_instances where key = '${key}'`,
        );
        expect(
          (
            await f.request(
              `/v1/projects/${f.a1.id}`,
              undefined,
              f.owner.cookie,
              undefined,
              'DELETE',
            )
          ).status,
        ).toBe(204);
        const job = f.jobs().find((candidate) => candidate.name === 'core.projects.erase');
        if (!job) throw new Error('Missing project erasure handler');
        expect(
          await job
            .run(
              { organizationId: f.organizationId, projectId: f.a1.id, archivedProject: true },
              {},
            )
            .catch((error: unknown) => error),
        ).toMatchObject({ code: 'capability_unavailable' });
        expect(
          (await f.db.execute<{ id: string }>(`select id from form_submissions where id = '${id}'`))
            .rows,
        ).toHaveLength(1);
      },
      {},
      { durableDelivery: true, consumeJobs: false },
    );
  },
  30_000,
);

test.skipIf(!available)(
  'disabled attachment providers cannot be bypassed by owner deletion or retention changes',
  async () => {
    await scenario(async (base) => {
      const f = await prepareIsolationFixture(base);
      const { key } = await createFormFixture(f);
      const id = await createSubmissionFixture(f, key);
      const root = `/v1/projects/${f.a1.id}/forms/${key}`;
      await f.db.execute(
        `update form_submissions set data = data || '{"cv":["file_01jbf5p0a0e008008008008008"]}'::jsonb where id = '${id}'`,
      );
      await f.db.execute(
        `update module_instance_revisions set config = jsonb_set(config, '{fields}', (config->'fields') || '[{"key":"cv","type":"file","label":"CV","zone":"cv","maxFiles":1,"required":false}]'::jsonb) where instance_id = (select instance_id from form_submissions where id = '${id}')`,
      );
      expect(
        (
          await f.request(
            `${root}/submissions/${id}`,
            undefined,
            f.member.cookie,
            undefined,
            'DELETE',
          )
        ).status,
      ).toBe(422);
      expect(
        (
          await f.request(
            `${root}/submissions/${id}`,
            { read: true },
            f.member.cookie,
            undefined,
            'PATCH',
          )
        ).status,
      ).toBe(200);
      expect(
        (
          await f.request(
            `${root}/submissions/${id}`,
            { spamVerdict: 'spam' },
            f.member.cookie,
            undefined,
            'PATCH',
          )
        ).status,
      ).toBe(422);
      const subject = f.jobs().find((candidate) => candidate.name === 'core.privacy.erase');
      if (!subject) throw new Error('Missing subject erasure handler');
      const context = { organizationId: f.organizationId, projectId: f.a1.id };
      expect(
        await subject.run(context, { email: 'ada@example.com' }).catch((error: unknown) => error),
      ).toMatchObject({ code: 'capability_unavailable' });
      expect(
        (
          await f.request(
            root,
            { configVersion: 1, config: { retentionDays: 7 } },
            f.admin.cookie,
            undefined,
            'PATCH',
          )
        ).status,
      ).toBe(422);
      expect(
        (await f.request(`${root}/submissions/${id}`, undefined, f.member.cookie)).status,
      ).toBe(200);
    });
  },
  30_000,
);
