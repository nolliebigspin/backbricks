import { expect, test } from 'bun:test';

import { instanceResponseSchema } from '@backbricks/core';
import { submissionDetailSchema } from '@backbricks/module-forms';
import { uploadIntentResponseSchema } from '@backbricks/module-uploads';

import {
  attachmentsCatalog,
  attachmentsEnvironment,
  prepareAttachments,
} from '../test/attachments-fixture.ts';
import { idResponseSchema, scenario } from '../test/auth-fixture.ts';
import { issueKey } from '../test/platform-read-fixture.ts';
import { assertAllowedFields } from '../test/public-responses.ts';
import { uploadsAvailable } from '../test/uploads-fixture.ts';

test.skipIf(!uploadsAvailable)(
  'form attachment claims store IDs, propagate subject/owner expiry and expose only owner-bound metadata',
  async () => {
    await scenario(
      async (base) => {
        const f = await prepareAttachments(base);
        try {
          const publicSchema = await (
            await f.request(`/v1/public/forms/${f.form.key}?key=${f.publishable.token}`)
          ).json();
          assertAllowedFields(publicSchema, [
            'key',
            'proofOfWork',
            'honeypotField',
            'fields[].key',
            'fields[].type',
            'fields[].label',
            'fields[].required',
            'fields[].zone',
            'fields[].maxFiles',
          ]);
          expect(publicSchema).toMatchSnapshot();
          const file = await f.ready('person-private.pdf');
          const submitted = await f.submit([file.fileRef]);
          expect(submitted.status).toBe(200);
          const { id } = idResponseSchema.parse(await submitted.json());
          const entry = await f.use(async (tx) => tx.modules.forms?.get(f.form.id, id));
          expect(entry?.data['cv']).toEqual([file.fileId]);
          expect(JSON.stringify(entry)).not.toContain(file.uploadToken);
          const row = await f.use(async (tx) => tx.modules.uploads?.get(file.fileId, f.now()));
          expect(row).toMatchObject({
            ownerType: 'form_submission',
            ownerId: id,
            subjectEmail: 'person@example.test',
          });
          expect(row?.ownerExpiresAt).toEqual(entry?.expiresAt);
          expect(row?.expiresAt).toEqual(entry?.expiresAt);
          const detailPath = `/v1/projects/${f.a1.id}/forms/${f.form.key}/submissions/${id}`;
          const response = await f.request(detailPath, undefined, f.member.cookie);
          expect(response.status).toBe(200);
          const detail = submissionDetailSchema.parse(await response.json());
          expect(detail.attachments).toHaveLength(1);
          expect(detail.attachments?.[0]).toMatchObject({
            id: file.fileId,
            name: 'person-private.pdf',
            status: 'ready',
            scanStatus: 'not_scanned',
          });
          expect(JSON.stringify(detail)).not.toContain(file.uploadToken);
          expect(JSON.stringify(detail)).not.toContain('stg/');
          expect(
            (await f.request(detailPath.replace(f.a1.id, f.a2.id), undefined, f.owner.cookie))
              .status,
          ).toBe(404);
          const zone = instanceResponseSchema.parse(
            await (await f.request(`${f.zonePath}/cv`, undefined, f.owner.cookie)).json(),
          );
          expect(
            (
              await f.request(
                `${f.zonePath}/cv`,
                { configVersion: zone.configVersion, config: { retentionDays: null } },
                f.owner.cookie,
                undefined,
                'PATCH',
              )
            ).status,
          ).toBe(200);
          expect(
            (await f.use(async (tx) => tx.modules.uploads?.get(file.fileId, f.now())))?.expiresAt,
          ).toEqual(entry?.expiresAt);
          expect((await f.submit([file.fileRef])).status).toBe(404);
          expect(f.logs.join('')).not.toContain(file.uploadToken);
        } finally {
          await f.cleanup();
        }
      },
      attachmentsEnvironment,
      { catalog: attachmentsCatalog, durableDelivery: true, consumeJobs: false },
    );
  },
  30_000,
);

test.skipIf(!uploadsAvailable)(
  'claim validation is all-or-nothing for wrong tokens/zones, duplicate, unready, expired and foreign references',
  async () => {
    await scenario(
      async (base) => {
        const f = await prepareAttachments(base);
        try {
          const good = await f.ready();
          const pending = await f.intent();
          const pendingRef = `${pending.fileId}.${pending.uploadToken}`;
          expect((await f.submit([good.fileRef, pendingRef])).status).toBe(404);
          const wrongToken = good.fileRef.slice(0, -1) + (good.fileRef.endsWith('0') ? '1' : '0');
          expect((await f.submit([wrongToken])).status).toBe(404);
          expect((await f.submit([good.fileRef, good.fileRef])).status).toBe(422);
          expect((await f.submit([good.fileRef, wrongToken])).status).toBe(422);
          const wrongZone = await f.createForm('wrong-zone', 'other');
          expect((await f.submit([good.fileRef], wrongZone.key)).status).toBe(404);
          const expired = await f.ready();
          await f.use(async (tx) => {
            const row = await tx.modules.uploads?.get(expired.fileId, f.now());
            if (!row) throw new Error('Missing file.');
            await tx.modules.uploads?.patch(row.id, {
              expiresAt: new Date(row.createdAt.getTime() + 1),
              updatedAt: f.now(),
            });
          });
          expect((await f.submit([expired.fileRef])).status).toBe(404);
          expect(
            (
              await f.request(
                `/v1/projects/${f.b1.id}/upload-zones`,
                { key: 'cv', name: 'Other', config: { presets: ['pdf'], scanRequired: false } },
                f.other.cookie,
              )
            ).status,
          ).toBe(201);
          const foreignKey = await issueKey({ ...f, owner: f.other }, f.b1.id, {
            kind: 'secret',
            name: 'Other',
            scopes: ['uploads:create'],
            expiresAt: null,
          });
          const foreign = uploadIntentResponseSchema.parse(
            await (
              await f.request(
                '/v1/public/upload-zones/cv/files',
                { data: { name: 'other.pdf', size: 4, type: 'application/pdf' } },
                undefined,
                { authorization: `Bearer ${foreignKey.token}` },
              )
            ).json(),
          );
          expect(
            (await f.submit([good.fileRef, `${foreign.fileId}.${foreign.uploadToken}`])).status,
          ).toBe(404);
          expect(
            (await f.use(async (tx) => tx.modules.uploads?.get(good.fileId, f.now())))?.ownerId,
          ).toBeNull();
          expect((await f.use(async (tx) => tx.modules.forms?.counts(f.form.id)))?.total).toBe(0);
          const zone = instanceResponseSchema.parse(
            await (await f.request(`${f.zonePath}/cv`, undefined, f.owner.cookie)).json(),
          );
          expect(
            (
              await f.request(
                `${f.zonePath}/cv`,
                { configVersion: zone.configVersion, config: { scanRequired: true } },
                f.owner.cookie,
                undefined,
                'PATCH',
              )
            ).status,
          ).toBe(200);
          expect((await f.submit([good.fileRef])).status).toBe(404);
        } finally {
          await f.cleanup();
        }
      },
      attachmentsEnvironment,
      { catalog: attachmentsCatalog, durableDelivery: true, consumeJobs: false },
    );
  },
  30_000,
);

test.skipIf(!uploadsAvailable)(
  'competing form submissions claim a file once; the losing transaction inserts no entry',
  async () => {
    await scenario(
      async (base) => {
        const f = await prepareAttachments(base);
        try {
          const file = await f.ready();
          const results = await Promise.all([f.submit([file.fileRef]), f.submit([file.fileRef])]);
          expect(results.map((response) => response.status).toSorted((a, b) => a - b)).toEqual([
            200, 404,
          ]);
          expect((await f.use(async (tx) => tx.modules.forms?.counts(f.form.id)))?.total).toBe(1);
          expect(
            (
              await f.db.execute<{ id: string }>(
                "select id from audit_logs where action='uploads.files.claimed'",
              )
            ).rows,
          ).toHaveLength(1);
        } finally {
          await f.cleanup();
        }
      },
      attachmentsEnvironment,
      { catalog: attachmentsCatalog, durableDelivery: true, consumeJobs: false },
    );
  },
  30_000,
);

test.skipIf(!uploadsAvailable)(
  'claim, owner insert, audit, event and usage are one rollback boundary',
  async () => {
    await scenario(
      async (base) => {
        const f = await prepareAttachments(base);
        try {
          const failures = [
            { table: 'form_submissions', condition: "status <> 'open'" },
            { table: 'audit_logs', condition: "action <> 'uploads.files.claimed'" },
            { table: 'events', condition: "type <> 'forms.submission.created'" },
            { table: 'usage_counters', condition: "metric <> 'forms.submissions'" },
          ];
          for (const failure of failures) {
            // oxlint-disable-next-line no-await-in-loop -- Each injected failure owns a distinct real ready file.
            const file = await f.ready('private-claim-person.pdf');
            // oxlint-disable-next-line no-await-in-loop -- Save its original unclaimed expiry before exercising rollback.
            const before = await f.use(async (tx) => tx.modules.uploads?.get(file.fileId, f.now()));
            // oxlint-disable-next-line no-await-in-loop -- SQL identifiers/conditions are fixture constants, never request input.
            await f.db.execute(
              `alter table ${failure.table} add constraint fixture_claim_failure check (${failure.condition}) not valid`,
            );
            // oxlint-disable-next-line no-await-in-loop -- The whole claim/owner write must fail with the chosen dependency.
            const response = await f.submit([file.fileRef]);
            expect(response.status).toBe(500);
            // oxlint-disable-next-line no-await-in-loop -- Observe committed state after the failed request frame.
            const after = await f.use(async (tx) => tx.modules.uploads?.get(file.fileId, f.now()));
            expect(after).toMatchObject({
              ownerId: null,
              ownerType: null,
              ownerExpiresAt: null,
              subjectEmail: null,
            });
            expect(after?.expiresAt).toEqual(before?.expiresAt);
            // oxlint-disable-next-line no-await-in-loop -- Remove only the active failure fixture before the next case.
            await f.db.execute(
              `alter table ${failure.table} drop constraint fixture_claim_failure`,
            );
          }
          expect((await f.use(async (tx) => tx.modules.forms?.counts(f.form.id)))?.total).toBe(0);
          expect(
            (
              await f.db.execute<{ id: string }>(
                "select id from audit_logs where action='uploads.files.claimed'",
              )
            ).rows,
          ).toHaveLength(0);
          expect(f.logs.join('')).not.toContain('private-claim-person');
        } finally {
          await f.cleanup();
        }
      },
      attachmentsEnvironment,
      { catalog: attachmentsCatalog, durableDelivery: true, consumeJobs: false },
    );
  },
  30_000,
);
