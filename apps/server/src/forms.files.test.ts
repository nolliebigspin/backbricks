import { expect, test } from 'bun:test';

import { defineModule, defineModuleCatalog, monthlyUsagePeriod } from '@backbricks/core';
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
      privacy: { exportSubject: async () => ({}), deleteSubject: async () => 0 },
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
