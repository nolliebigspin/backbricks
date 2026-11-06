# ADR-0029: Automatic isolation coverage

- **Status:** accepted
- **Date:** 2026-11-06
- **Task:** P1.13a

## Context

Route declarations alone do not prove tenant isolation. A new operation must have a concrete request case, including organization operations mounted through Better Auth. Cached tests must not reuse a run that skipped unavailable services, and dependent typechecks must see source changes in upstream packages.

## Decision

The [isolation suite](../../apps/server/src/tenant-isolation.test.ts) enumerates the actual API manifest and the auth organization policy registry. Each management operation needs its own typed fixture. Probe method/path must match the registered operation, so an unrelated successful request cannot satisfy coverage. API registration already compares declarations with Hono's runtime handlers. The auth runtime separately inventories Better Auth's organization endpoint metadata: declared operations must exist, and every undeclared library organization operation must return 404 without changing state.

Fixtures use real HTTP, generated auth tables and Postgres tenant repositories: two organizations, two projects each, owner/admin/member roles and separate invitation targets. Resource probes require foreign 404; collections require owned IDs and exclude foreign IDs; creation verifies tenant ownership. Denied mutations compare business data, identity state, audit and outbox snapshots before/after. Snapshot projections omit credentials, email addresses and raw invitation tokens. Identity-table access is confined to the existing auth exception; business tables use scoped repositories.

The suite proves its detectors with omitted-case and mismatched-probe checks, and a deliberately unscoped real SQL collection repository confined to test fixtures. Every later management route task adds its own cases here.

[Turbo configuration](../../turbo.json) includes shared scripts and the root TypeScript config in task inputs. A `transit` task propagates dependency hashes while allowing independent typechecks to run in parallel, following the [official Turbo pattern](https://turborepo.dev/docs/crafting-your-repository/configuring-tasks#dependent-tasks-that-can-be-run-in-parallel). Tests are uncached: live-service availability and database state are external inputs, including local service-unavailable skips. CI/test service environment variables pass through explicitly.

## Consequences and evidence

`bun test apps/server/src/tenant-isolation.test.ts scripts/test/turbo-cache.test.ts` exercises the real isolation fixtures and a disposable two-package Turbo workspace. The cache test verifies dependency/shared-script invalidation, uncached tests, and a negative control reproducing the previous missing dependency hash. Full repository checks no longer need forced cache bypass for tests.

This is the initial suite, not proof of routes that have not been implemented. The four synthetic API operations remain test-only; production project/key/module routes must join the same coverage surface as they land. Backend route tests complement later dashboard/E2E work.
