import { expect, test } from 'bun:test';

import {
  instanceResponseSchema,
  createIds,
  notificationDispatchPayloadSchema,
  queueEnvelopeSchema,
} from '@backbricks/core';
import { createWithTenant } from '@backbricks/db';

import { available, idResponseSchema, scenario } from '../test/auth-fixture.ts';
import { createFormFixture, createSubmissionFixture, validAnswers } from '../test/forms-fixture.ts';
import { prepareIsolationFixture } from '../test/isolation/setup.ts';

test.skipIf(!available)(
  'the durable notification consumer queues matching rules once and ignores archived sources',
  async () => {
    await scenario(
      async (base) => {
        const f = await prepareIsolationFixture(base);
        const { key } = await createFormFixture(f);
        const other = await createFormFixture(f, 'other');
        const instance = async (form: string) =>
          instanceResponseSchema.parse(
            await (
              await f.request(`/v1/projects/${f.a1.id}/forms/${form}`, undefined, f.admin.cookie)
            ).json(),
          );
        const form = await instance(key),
          otherForm = await instance(other.key);
        const rule = async (instanceId: string | null, enabled = true) =>
          idResponseSchema.parse(
            await (
              await f.request(
                `/v1/projects/${f.a1.id}/notification-rules`,
                {
                  eventType: 'forms.submission.created',
                  instanceId,
                  recipientUserIds: [f.member.id],
                  enabled,
                },
                f.admin.cookie,
              )
            ).json(),
          ).id;
        const global = await rule(null);
        const bound = await rule(form.id);
        await rule(otherForm.id);
        await rule(form.id, false);
        const dispatch = f.jobs().find((job) => job.name === 'core.notifications.dispatch');
        expect(dispatch).toBeDefined();
        if (!dispatch) throw new Error('Expected notification consumer');
        const context = { organizationId: f.organizationId, projectId: f.a1.id };
        const payload = async (id: string) => {
          await f.dispatchOutbox();
          const rows = await f.db.execute<{ data: unknown }>(
            "select data from pgboss.job where name = 'core.notifications.dispatch'",
          );
          const events = rows.rows.map((row) =>
            notificationDispatchPayloadSchema.parse(queueEnvelopeSchema.parse(row.data).payload),
          );
          const found = events.find((row) => row.event.subjectId === id);
          if (!found) throw new Error('Expected durable event handoff');
          return found;
        };
        const queued = async () =>
          (
            await f.db.execute<{ data: unknown }>(
              "select data from pgboss.job where name = 'core.notifications.deliver'",
            )
          ).rows;
        const first = await createSubmissionFixture(f, key);
        const event = await payload(first);
        await f.db.execute(
          `alter table pgboss.job add constraint fixture_notification_enqueue check (name <> 'core.notifications.deliver' or data->'payload'->>'ruleId' <> '${global}') not valid`,
        );
        const failed = await dispatch.run(context, event).catch((error: unknown) => error);
        expect(failed).toBeInstanceOf(Error);
        await f.db.execute('alter table pgboss.job drop constraint fixture_notification_enqueue');
        expect(await queued()).toHaveLength(0);
        await dispatch.run(context, event);
        await dispatch.run(context, event);
        const deliveries = await queued();
        expect(deliveries).toHaveLength(2);
        expect(deliveries.map((row) => queueEnvelopeSchema.parse(row.data).payload)).toEqual(
          expect.arrayContaining([
            { ruleId: global, eventId: event.event.id, instanceId: form.id, subjectId: first },
            { ruleId: bound, eventId: event.event.id, instanceId: form.id, subjectId: first },
          ]),
        );
        expect(JSON.stringify(deliveries)).not.toContain(f.member.email);
        expect(JSON.stringify(deliveries)).not.toContain(validAnswers.message);
        const withTenant = createWithTenant(f.db);
        const ids = createIds({ now: f.now });
        await withTenant(context, async (tx) => {
          const template = await tx.repositories.notificationRules.get(bound);
          for (let index = 0; index < 101; index++) {
            // oxlint-disable-next-line no-await-in-loop -- Seed real configuration in one fixture transaction.
            await tx.repositories.notificationRules.insert({
              ...template,
              id: ids.generate('ntf'),
            });
          }
        });
        const second = await payload(await createSubmissionFixture(f, key));
        await dispatch.run(context, second);
        expect(await queued()).toHaveLength(102);
        const dispatchRows = await f.db.execute<{ data: unknown }>(
          "select data from pgboss.job where name = 'core.notifications.dispatch'",
        );
        const continuation = dispatchRows.rows
          .map((row) =>
            notificationDispatchPayloadSchema.parse(queueEnvelopeSchema.parse(row.data).payload),
          )
          .find((row) => row.event.id === second.event.id && row.cursor);
        expect(continuation).toBeDefined();
        if (!continuation) throw new Error('Expected bounded rule continuation');
        await dispatch.run(context, continuation);
        await dispatch.run(context, second);
        await dispatch.run(context, continuation);
        expect(await queued()).toHaveLength(105);
        const pending = await payload(await createSubmissionFixture(f, key));
        expect(
          (
            await f.request(
              `/v1/projects/${f.a1.id}/forms/${key}?configVersion=1`,
              undefined,
              f.admin.cookie,
              undefined,
              'DELETE',
            )
          ).status,
        ).toBe(204);
        await dispatch.run(context, pending);
        expect(await queued()).toHaveLength(105);
      },
      {},
      { durableDelivery: true, consumeJobs: false },
    );
  },
  30_000,
);
