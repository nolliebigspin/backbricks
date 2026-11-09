# ADR-0043: Atomic configuration apply and exports

- **Status:** accepted
- **Date:** 2026-11-06
- **Task:** P1.7d

## Decision

`PUT …/config?dryRun=false` accepts the original config document and its `planHash`. The [configuration service](../../packages/core/src/configuration/service.ts) requires current config-read/write permissions (admin for session mutations), locks the active project, rereads all instance versions, recomputes the canonical plan/binding and verifies the signature/expiry before any write. Destructive plans additionally require the destructive grant. The same principal needs both read access to plan and write access to apply; a token grants neither.

Apply reuses generic instance create/replace/archive, with provider modules ordered before capability consumers. Replacement uses whole validated config, so removed members cannot survive through merge-patch semantics. Revisions, module retention/capability writes, audit and outbox activity remain in the one caller transaction. A failure at any operation rolls back all preceding changes. Rechecking under the shared project lock prevents two plans from overwriting one base. Changed state invalidates replay; no-op plans create no revisions or activity and may be replayed harmlessly until expiry. Omitted sections preserve state; explicit removals archive configuration and never erase personal records.

`GET /v1/schema/config` exposes an offline [editor JSON Schema](../../packages/core/src/configuration/schema-export.ts) derived from the envelope and selected operational module schemas. Disabled/unknown sections are disallowed and module format versions are explicit. It exposes static schemas only, never tenant configuration. `GET …/types?lang=ts` requires config-read access and invokes module codegen on the current in-memory format without writing or passing view-only metadata to stored-instance validators. No production domain schema or placeholder API is introduced.

## Evidence

`configuration.apply.test.ts` runs real HTTP/Postgres/Mailpit. It covers missing/tampered/expired/cross-principal/cross-project plans, changed desired config, concurrent apply and stale replay, no-op behavior, destructive-scope denial, explicit archive, schema snapshots and type hooks. A real outbox constraint fails after a previous operation already wrote configuration/retention/audit/events; the complete tenant snapshot remains unchanged. Schema output has a public-response snapshot; types/config routes join the automatic isolation inventory.
