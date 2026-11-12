import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { createIds, spamVerdictSchema, systemClock, type WithTenant } from '@backbricks/core';
import { sql } from 'drizzle-orm';

import { expectDatabaseError } from '../../test/expect-database-error.ts';
import { createTenantFixture } from '../../test/tenant-fixtures.ts';
import { postgresAvailable } from '../../test/test-database.ts';
import type { DatabaseHandle } from '../client.ts';
import { formSubmissions, SPAM_VERDICTS } from '../schema/forms.ts';
import { moduleInstances } from '../schema/instances.ts';
import { createWithTenant } from '../with-tenant.ts';
import type { createFormsRepository, FormSubmissionRow } from './forms.ts';

type FormsRepo = ReturnType<typeof createFormsRepository>;
import { moduleRepositoryFactories, selectModuleRepositories } from './modules.ts';

const available = await postgresAvailable();
const ids = createIds(systemClock);
const DAY = 86_400_000;
const base = new Date('2026-11-01T00:00:00.000Z');
const at = (days: number) => new Date(base.getTime() + days * DAY);

describe.skipIf(!available)('forms repository (real Postgres)', () => {
  let fixture: Awaited<ReturnType<typeof createTenantFixture>>;
  let handle: DatabaseHandle;
  let withTenant: WithTenant;
  const instance = {
    a1: ids.generate('mod'),
    a1b: ids.generate('mod'),
    a2: ids.generate('mod'),
    b1: ids.generate('mod'),
  };
  let a1: { organizationId: string; projectId: string };
  let a2: { organizationId: string; projectId: string };
  let b1: { organizationId: string; projectId: string };

  const forms = <T>(
    context: { organizationId: string; projectId: string },
    fn: (repo: FormsRepo) => Promise<T>,
  ) =>
    withTenant(context, (tx) => {
      const repo: unknown = Reflect.get(tx.modules, 'forms');
      if (!repo) throw new Error('Expected the forms repository');
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Bound from the production factory above.
      return fn(repo as FormsRepo);
    });
  function entry(
    instanceId: string,
    overrides: Partial<Omit<FormSubmissionRow, 'organizationId' | 'projectId'>> & {
      searchText?: string;
    } = {},
  ) {
    return {
      id: ids.generate('sub'),
      instanceId,
      configVersion: 1,
      data: { name: 'Ada', message: 'Hello world' },
      status: 'open' as const,
      readAt: null,
      spamVerdict: 'clean' as const,
      spamReasons: [],
      isTest: false,
      subjectEmail: 'ada@example.com',
      source: { uaFamily: 'firefox', origin: 'https://example.com', path: '/contact' },
      createdAt: base,
      updatedAt: base,
      expiresAt: at(180),
      searchText: 'Ada Hello world',
      ...overrides,
    };
  }

  beforeAll(async () => {
    fixture = await createTenantFixture();
    handle = fixture.handle;
    withTenant = createWithTenant(
      handle.db,
      selectModuleRepositories(moduleRepositoryFactories, ['forms']),
    );
    a1 = { organizationId: 'org-a', projectId: fixture.projectIds.a1 };
    a2 = { organizationId: 'org-a', projectId: fixture.projectIds.a2 };
    b1 = { organizationId: 'org-b', projectId: fixture.projectIds.b1 };
    const row = (id: string, project: typeof a1, key: string) => ({
      id,
      ...project,
      moduleType: 'forms',
      key,
      name: key,
      config: {},
      moduleVersion: 1,
      createdAt: base,
      updatedAt: base,
    });
    await handle.db
      .insert(moduleInstances)
      .values([
        row(instance.a1, a1, 'contact'),
        row(instance.a1b, a1, 'quote'),
        row(instance.a2, a2, 'contact'),
        row(instance.b1, b1, 'contact'),
      ]);
  });
  afterAll(async () => {
    await handle.close();
    await fixture.database.drop();
  });

  test('spam verdict values match the shared guard', () => {
    expect([...SPAM_VERDICTS]).toEqual(spamVerdictSchema.shape.status.options);
  });

  test('constraints reject cross-tenant parents, invalid enums and bad expiry', async () => {
    const raw = (overrides: Record<string, unknown>) => {
      const { searchText, ...values } = entry(instance.a1);
      const row: Omit<typeof formSubmissions.$inferInsert, 'searchVector'> = {
        ...values,
        spamReasons: [],
        ...a1,
      };
      return handle.db
        .insert(formSubmissions)
        .values(
          Object.assign(
            { ...row, searchVector: sql`to_tsvector('simple', ${searchText})` },
            overrides,
          ),
        );
    };
    await expectDatabaseError(raw({ instanceId: instance.b1 }), '23503');
    await expectDatabaseError(raw({ instanceId: instance.a2 }), '23503');
    await expectDatabaseError(raw({ status: 'archived' }), '22P02');
    await expectDatabaseError(raw({ spamVerdict: 'ok' }), '22P02');
    await expectDatabaseError(raw({ expiresAt: at(-1) }), '23514');
    await expectDatabaseError(raw({ spamVerdict: 'spam', expiresAt: null }), '23514');
    await expectDatabaseError(raw({ subjectEmail: 'Ada@Example.com' }), '23514');
  });

  test('every query is scoped: other projects and forms behave as missing', async () => {
    const own = await forms(a1, (repo) => repo.insert(entry(instance.a1)));
    const foreign = await forms(b1, (repo) => repo.insert(entry(instance.b1)));
    expect(own).toMatchObject({ ...a1, instanceId: instance.a1, data: { name: 'Ada' } });
    expect(await forms(a1, (repo) => repo.get(instance.a1, own.id))).toEqual(own);
    for (const probe of [
      () => forms(a1, (repo) => repo.get(instance.b1, foreign.id)),
      () => forms(a1, (repo) => repo.get(instance.a1, foreign.id)),
      () => forms(a1, (repo) => repo.get(instance.a1b, own.id)),
      () => forms(a2, (repo) => repo.get(instance.a1, own.id)),
      () =>
        forms(b1, (repo) => repo.patch(instance.a1, own.id, { status: 'done', updatedAt: base })),
      () => forms(b1, (repo) => repo.delete(instance.a1, own.id)),
    ])
      // oxlint-disable-next-line no-await-in-loop -- Each probe is its own transaction.
      expect(await probe().catch((error: unknown) => error)).toMatchObject({ code: 'not_found' });
    const listed = await forms(a1, (repo) => repo.list(instance.b1, {}, { limit: 100 }));
    expect(listed).toEqual([]);
    expect(
      await forms(b1, (repo) => repo.findBySubject('ada@example.com', { limit: 100 })),
    ).toEqual([expect.objectContaining({ id: foreign.id })]);
  });

  test('list filters, search and keyset pagination combine', async () => {
    const project = a2;
    const form = instance.a2;
    const rows = await forms(project, async (repo) => [
      await repo.insert(
        entry(form, { createdAt: at(1), updatedAt: at(1), searchText: 'Kitchen renovation quote' }),
      ),
      await repo.insert(
        entry(form, {
          createdAt: at(2),
          updatedAt: at(2),
          status: 'done',
          readAt: at(3),
          searchText: 'Garden design',
        }),
      ),
      await repo.insert(
        entry(form, {
          createdAt: at(3),
          updatedAt: at(3),
          spamVerdict: 'spam',
          expiresAt: at(30),
          searchText: 'cheap pills',
        }),
      ),
      await repo.insert(
        entry(form, {
          createdAt: at(4),
          updatedAt: at(4),
          isTest: true,
          searchText: 'kitchen test entry',
        }),
      ),
    ]);
    const list = (filters: Parameters<FormsRepo['list']>[1], limit = 100) =>
      forms(project, (repo) => repo.list(form, filters, { limit })).then((items) =>
        items.map((item) => item.id),
      );
    const [kitchen = '', garden = '', spam = '', testEntry = ''] = rows.map((row) => row.id);
    expect(await list({})).toEqual([testEntry, spam, garden, kitchen]);
    expect(await list({ folder: 'inbox' })).toEqual([testEntry, garden, kitchen]);
    expect(await list({ folder: 'spam' })).toEqual([spam]);
    expect(await list({ status: 'done' })).toEqual([garden]);
    expect(await list({ read: false, folder: 'inbox' })).toEqual([testEntry, kitchen]);
    expect(await list({ isTest: true })).toEqual([testEntry]);
    expect(await list({ from: at(2), to: at(3) })).toEqual([spam, garden]);
    expect(await list({ query: 'kitchen' })).toEqual([testEntry, kitchen]);
    expect(await list({ query: 'kitchen -test', isTest: false })).toEqual([kitchen]);
    expect(await list({ query: '"garden design"' })).toEqual([garden]);
    // Keyset pages: two at a time with a look-ahead row, then continue before the last one.
    const first = await forms(project, (repo) =>
      repo.list(form, {}, { limit: 2, lookAhead: true }),
    );
    expect(first.map((row) => row.id)).toEqual([testEntry, spam, garden]);
    const second = await forms(project, (repo) =>
      repo.list(form, {}, { limit: 2, before: first[1] }),
    );
    expect(second.map((row) => row.id)).toEqual([garden, kitchen]);
    expect(await forms(project, (repo) => repo.counts(form))).toEqual({
      total: 4,
      unread: 2,
      spam: 1,
    });
  });

  test('bulk changes are all-or-nothing', async () => {
    const project = b1;
    const created = await forms(project, async (repo) => [
      await repo.insert(entry(instance.b1)),
      await repo.insert(entry(instance.b1)),
    ]);
    const outsider = await forms(a1, (repo) => repo.insert(entry(instance.a1)));
    const idsToChange = created.map((row) => row.id);
    expect(
      await forms(project, (repo) =>
        repo.bulkPatch(instance.b1, [...idsToChange, outsider.id], {
          status: 'done',
          updatedAt: at(1),
        }),
      ).catch((error: unknown) => error),
    ).toMatchObject({ code: 'not_found' });
    expect(
      await forms(project, (repo) =>
        repo.bulkDelete(instance.b1, [idsToChange[0]!, idsToChange[0]!]),
      ).catch((error: unknown) => error),
    ).toMatchObject({ code: 'invalid_request' });
    const unchanged = await forms(project, (repo) =>
      Promise.all(idsToChange.map((id) => repo.get(instance.b1, id))),
    );
    expect(unchanged.map((row) => row.status)).toEqual(['open', 'open']);
    expect(
      await forms(project, (repo) =>
        repo.bulkPatch(instance.b1, idsToChange, {
          status: 'done',
          readAt: at(1),
          updatedAt: at(1),
        }),
      ),
    ).toBe(2);
    expect(await forms(project, (repo) => repo.bulkDelete(instance.b1, idsToChange))).toBe(2);
    expect(await forms(a1, (repo) => repo.get(instance.a1, outsider.id))).toMatchObject({
      status: 'open',
    });
  });

  test('expiry: purge removes only expired rows; retention changes keep the spam cap', async () => {
    const project = a1;
    const form = instance.a1b;
    const [kept, expired, spam, unlimited] = await forms(project, async (repo) => [
      await repo.insert(entry(form, { expiresAt: at(10) })),
      await repo.insert(entry(form, { expiresAt: at(2) })),
      await repo.insert(entry(form, { spamVerdict: 'spam', expiresAt: at(30) })),
      await repo.insert(entry(form, { expiresAt: null })),
    ]);
    expect(await forms(project, (repo) => repo.purgeExpired(at(5), 100))).toBe(1);
    const remaining = await forms(project, (repo) => repo.list(form, {}, { limit: 100 }));
    expect(remaining.map((row) => row.id).toSorted()).toEqual(
      [kept.id, spam.id, unlimited.id].toSorted(),
    );
    expect(await forms(project, (repo) => repo.recomputeExpiry(form, 7))).toBe(3);
    const byId = async (id: string) => forms(project, (repo) => repo.get(form, id));
    expect((await byId(kept.id)).expiresAt).toEqual(at(7));
    expect((await byId(unlimited.id)).expiresAt).toEqual(at(7));
    expect((await byId(spam.id)).expiresAt).toEqual(at(7));
    await forms(project, (repo) => repo.recomputeExpiry(form, 365));
    expect((await byId(kept.id)).expiresAt).toEqual(at(365));
    expect((await byId(spam.id)).expiresAt).toEqual(at(7));
    await forms(project, (repo) => repo.recomputeExpiry(form, null));
    expect((await byId(kept.id)).expiresAt).toBeNull();
    expect((await byId(spam.id)).expiresAt).toEqual(at(7));
    expect(expired).toBeDefined();
  });

  test('subject lookup/deletion and project erasure stay inside the project', async () => {
    const email = 'subject@example.com';
    const own = await forms(a2, (repo) => repo.insert(entry(instance.a2, { subjectEmail: email })));
    const sibling = await forms(a1, (repo) =>
      repo.insert(entry(instance.a1, { subjectEmail: email })),
    );
    expect(
      (await forms(a2, (repo) => repo.findBySubject(email, { limit: 100 }))).map((row) => row.id),
    ).toEqual([own.id]);
    expect(await forms(a2, (repo) => repo.deleteBySubject(email, 100))).toEqual([own.id]);
    expect(await forms(a1, (repo) => repo.findBySubject(email, { limit: 100 }))).toHaveLength(1);
    const before = await forms(a1, (repo) => repo.list(instance.a1, {}, { limit: 100 }));
    const erased = await forms(a2, (repo) => repo.eraseBatch(1000));
    expect(erased.length).toBeGreaterThan(0);
    expect(await forms(a2, (repo) => repo.counts(instance.a2))).toEqual({
      total: 0,
      unread: 0,
      spam: 0,
    });
    expect(await forms(a1, (repo) => repo.list(instance.a1, {}, { limit: 100 }))).toEqual(before);
    expect(sibling.id).toBeDefined();
    expect(await forms(a1, (repo) => repo.deleteBatch(instance.a1, 1))).toHaveLength(1);
  });

  test('the list, search, subject and expiry queries can use their indexes', async () => {
    const plans = await handle.db.transaction(async (tx) => {
      await tx.execute(sql`set local enable_seqscan = off`);
      const explain = async (query: ReturnType<typeof sql>) =>
        JSON.stringify(await tx.execute(sql`explain ${query}`));
      return {
        list: await explain(
          sql`select * from form_submissions where organization_id = 'org-a' and project_id = ${a1.projectId} and instance_id = ${instance.a1} order by created_at desc, id desc limit 50`,
        ),
        search: await explain(
          sql`select id from form_submissions where search_vector @@ websearch_to_tsquery('simple', 'kitchen')`,
        ),
        subject: await explain(
          sql`select id from form_submissions where organization_id = 'org-a' and project_id = ${a1.projectId} and subject_email = 'ada@example.com'`,
        ),
        expiry: await explain(
          sql`select id from form_submissions where organization_id = 'org-a' and project_id = ${a1.projectId} and expires_at is not null and expires_at <= now()`,
        ),
      };
    });
    expect(plans.list).toContain('form_submissions_list_idx');
    expect(plans.search).toContain('form_submissions_search_idx');
    expect(plans.subject).toContain('form_submissions_subject_idx');
    expect(plans.expiry).toContain('form_submissions_expiry_idx');
  });
});
