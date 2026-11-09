import { expect, test } from 'bun:test';

import {
  configPlanResponseSchema,
  instanceResponseSchema,
  platformMetaSchema,
  problemDetailsSchema,
} from '@backbricks/core';
import { createWithTenant } from '@backbricks/db';
import { formsConfigSchema } from '@backbricks/module-forms';

import { available, scenario } from '../test/auth-fixture.ts';
import { prepareIsolationFixture } from '../test/isolation/setup.ts';
import { issueKey } from '../test/platform-read-fixture.ts';

const problem = async (response: Response) => problemDetailsSchema.parse(await response.json());

test.skipIf(!available)(
  'forms is operational with app + Postgres only, through the generic instance API',
  async () => {
    // The default fixture environment is BACKBRICKS_MODULES=forms without storage or scanner.
    await scenario(async (base) => {
      const f = await prepareIsolationFixture(base);
      const meta = platformMetaSchema.parse(await (await f.request('/v1/meta')).json());
      expect(meta.modules.find((module) => module.type === 'forms')).toMatchObject({
        enabled: true,
        operational: true,
      });
      const root = `/v1/projects/${f.a1.id}/forms`;
      const created = await f.request(root, { key: 'contact', name: 'Contact' }, f.admin.cookie);
      expect(created.status).toBe(201);
      const form = instanceResponseSchema.parse(await created.json());
      const config = formsConfigSchema.parse(form.config);
      expect(config.spam.proofOfWork).toBe(true);
      expect(config.retentionDays).toBe(180);

      // Config errors keep their field paths; file fields need uploads (capability_unavailable).
      const invalid = await f.request(
        root,
        {
          key: 'broken',
          name: 'Broken',
          config: {
            fields: [
              { key: 'name', type: 'text', label: 'Name' },
              { key: 'name', type: 'text', label: 'Again' },
            ],
          },
        },
        f.admin.cookie,
      );
      expect(invalid.status).toBe(422);
      expect(await problem(invalid)).toMatchObject({
        code: 'validation_failed',
        errors: [{ path: 'fields.1.key', code: 'custom' }],
      });
      const withFile = await f.request(
        root,
        {
          key: 'apply',
          name: 'Apply',
          config: {
            fields: [
              { key: 'name', type: 'text', label: 'Name' },
              { key: 'cv', type: 'file', label: 'CV', zone: 'cv' },
            ],
          },
        },
        f.admin.cookie,
      );
      expect(withFile.status).toBe(422);
      expect(await problem(withFile)).toMatchObject({
        code: 'capability_unavailable',
        errors: [{ path: 'fields.1.type', code: 'capability_unavailable' }],
      });

      // Non-destructive edit with a config-write key; removing a field needs destructive rights.
      const writer = await issueKey(f, f.a1.id, {
        kind: 'secret',
        name: 'Writer',
        scopes: ['config:read', 'config:write'],
        expiresAt: null,
      });
      const asWriter = { authorization: `Bearer ${writer.token}` };
      const relabel = await f.request(
        `${root}/contact`,
        {
          configVersion: 1,
          config: {
            fields: config.fields.map((field) => ({ ...field, label: `${field.label}!` })),
          },
        },
        undefined,
        asWriter,
        'PATCH',
      );
      expect(relabel.status).toBe(200);
      const removal = {
        configVersion: 2,
        config: { fields: config.fields.filter((field) => field.key !== 'message') },
      };
      expect(
        (await f.request(`${root}/contact`, removal, undefined, asWriter, 'PATCH')).status,
      ).toBe(403);
      expect(
        (await f.request(`${root}/contact`, removal, f.admin.cookie, undefined, 'PATCH')).status,
      ).toBe(200);
      const revisions = await f.request(`${root}/contact/revisions`, undefined, f.member.cookie);
      expect(revisions.status).toBe(200);
      expect(await revisions.text()).toContain('"configVersion":3');

      // Rollback restores version 1's fields as a fresh revision.
      const rollback = await f.request(
        `${root}/contact/revisions/1/rollback`,
        { configVersion: 3 },
        f.admin.cookie,
      );
      expect(rollback.status).toBe(200);
      const restored = instanceResponseSchema.parse(await rollback.json());
      expect(restored.configVersion).toBe(4);
      expect(formsConfigSchema.parse(restored.config).fields).toEqual(config.fields);

      // Config-as-code plans and applies forms through the same registry section.
      const document = await (
        await f.request(`/v1/projects/${f.a1.id}/config`, undefined, f.owner.cookie)
      ).json();
      expect(JSON.stringify(document)).toContain('"forms"');
      const plan = await f.request(
        `/v1/projects/${f.a1.id}/config?dryRun=true`,
        { config: document },
        f.owner.cookie,
        undefined,
        'PUT',
      );
      expect(plan.status).toBe(200);
      const { planHash } = configPlanResponseSchema.parse(await plan.json());
      const applied = await f.request(
        `/v1/projects/${f.a1.id}/config?dryRun=false`,
        { config: document, planHash },
        f.owner.cookie,
        undefined,
        'PUT',
      );
      expect(applied.status).toBe(200);

      // Generated types include the form's submit payload.
      const types = await f.request(
        `/v1/projects/${f.a1.id}/types?lang=ts`,
        undefined,
        f.owner.cookie,
      );
      expect(await types.text()).toContain('"forms/contact"');

      // Archive (destructive) keeps history and removes the form from reads; all of it was audited.
      expect(
        (
          await f.request(
            `${root}/contact?configVersion=4`,
            undefined,
            f.admin.cookie,
            undefined,
            'DELETE',
          )
        ).status,
      ).toBe(204);
      expect((await f.request(`${root}/contact`, undefined, f.owner.cookie)).status).toBe(404);
      const actions = await createWithTenant(f.db)(
        { organizationId: f.organizationId, projectId: f.a1.id },
        async ({ repositories }) =>
          (await repositories.audit.list({ limit: 100 })).map((row) => row.action),
      );
      expect(actions).toEqual(
        expect.arrayContaining([
          'instance.created',
          'instance.updated',
          'instance.rolled_back',
          'instance.archived',
        ]),
      );
    });
  },
  30_000,
);

test.skipIf(!available)(
  'with forms disabled its routes return module_not_enabled',
  async () => {
    await scenario(
      async (base) => {
        const f = await prepareIsolationFixture(base);
        for (const path of [`/v1/projects/${f.a1.id}/forms`, '/v1/public/forms/contact']) {
          // oxlint-disable-next-line no-await-in-loop -- Independent probes against one server.
          const response = await f.request(path, undefined, f.owner.cookie);
          expect(response.status).toBe(404);
          // oxlint-disable-next-line no-await-in-loop -- See above.
          expect(await problem(response)).toMatchObject({ code: 'module_not_enabled' });
        }
      },
      { BACKBRICKS_MODULES: 'reviews' },
    );
  },
  20_000,
);
