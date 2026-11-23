import { expect, test } from 'bun:test';

import { configPlanResponseSchema } from '@backbricks/core';

import { available, scenario } from '../test/auth-fixture.ts';
import { prepareIsolationFixture } from '../test/isolation/setup.ts';
import { issueKey } from '../test/platform-read-fixture.ts';

test.skipIf(!available)(
  'MCP config plans bind to the key and apply with atomic MCP attribution',
  async () => {
    await scenario(async (base) => {
      const f = await prepareIsolationFixture(base);
      const project = `/v1/projects/${f.a1.id}`;
      const formKey = 'mcp-contact';
      const key = await issueKey(f, f.a1.id, {
        kind: 'secret',
        name: 'MCP agent',
        preset: 'agent',
        expiresAt: null,
      });
      const access = { authorization: `Bearer ${key.token}` };
      const config = {
        project: f.a1.id,
        modules: {
          forms: {
            [formKey]: {
              name: 'MCP contact',
              moduleVersion: 1,
              config: {
                fields: [{ key: 'message', label: 'Message', type: 'textarea', required: true }],
              },
            },
          },
        },
      };
      const plan = await base.request(
        `${project}/config?dryRun=true`,
        { config },
        undefined,
        access,
        'PUT',
      );
      expect(plan.status).toBe(200);
      const { planHash } = configPlanResponseSchema.parse(await plan.json());
      const applied = await base.request(
        `${project}/mcp/config`,
        { config, planHash },
        undefined,
        access,
        'PUT',
      );
      expect(applied.status).toBe(200);
      const read = await base.request(`${project}/forms/${formKey}`, undefined, f.owner.cookie);
      expect(await read.json()).toMatchObject({ key: formKey });
      const audit = await base.request(`${project}/audit-logs`, undefined, f.owner.cookie);
      expect(await audit.json()).toMatchObject({
        data: expect.arrayContaining([
          expect.objectContaining({ actorType: 'mcp', actorId: key.id }),
        ]),
      });
      const wrong = await base.request(
        `${project}/mcp/config`,
        { config, planHash },
        undefined,
        access,
        'PUT',
      );
      expect(wrong.status).toBe(409);

      const allowed = await base.request(
        `${project}/forms/${formKey}/mcp-test-submissions`,
        { message: 'test' },
        undefined,
        access,
      );
      expect(allowed.status).toBe(201);
      const activity = await base.request(`${project}/audit-logs`, undefined, f.owner.cookie);
      expect(await activity.json()).toMatchObject({
        data: expect.arrayContaining([
          expect.objectContaining({
            action: 'forms.test_submitted',
            actorType: 'mcp',
            actorId: key.id,
          }),
        ]),
      });
      const canary = 'private-input-canary';
      const malformed = await base.request(
        `${project}/forms/${formKey}/mcp-test-submissions`,
        { message: `${canary}${String.fromCharCode(0)}` },
        undefined,
        access,
      );
      expect(malformed.status).toBe(422);
      expect(base.logs.join('\n')).not.toContain(canary);

      const publishable = await issueKey(f, f.a1.id, {
        kind: 'publishable',
        name: 'Fixture website',
        expiresAt: null,
      });
      const inventory = await issueKey(f, f.a1.id, {
        kind: 'secret',
        name: 'Fixture inventory',
        scopes: ['keys:read'],
        expiresAt: null,
      });
      expect((await base.request(`${project}/keys`, undefined, undefined, access)).status).toBe(
        403,
      );
      const listed = await base.request(`${project}/keys`, undefined, undefined, {
        authorization: `Bearer ${inventory.token}`,
      });
      expect(listed.status).toBe(200);
      const metadata = await listed.text();
      expect(metadata).toContain(publishable.id);
      expect(metadata.includes(publishable.token)).toBe(false);
      expect(metadata.includes(inventory.token)).toBe(false);
    });
  },
  20_000,
);
