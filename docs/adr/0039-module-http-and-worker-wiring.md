# ADR-0039: Module HTTP and worker wiring

- **Status:** accepted
- **Date:** 2026-11-06
- **Task:** P1.6b; ARCHITECTURE §C; ADR-0037/0038

## Context

The validated registry and truthful availability catalog need a host bridge to HTTP, scoped repositories and workers. Module-defined scopes must use the same catalog at issuance and authentication; otherwise the contract would declare grants which the runtime silently rejects. Public credential/abuse composition and pg-boss arrive later in this milestone.

## Decision

The [HTTP bridge](../../apps/server/src/routes/modules.ts) mounts only selected complete definitions through the existing `ApiRoutes` registration boundary. The host owns project/resource prefixes, extends the parameter schema with its project selector and rejects any module-relative path that shadows a tenant selector. Management operations reuse current role/scope resolution, body limits, OpenAPI and automatic policy inventory. Module policy/schema declarations remain authoritative. The central registrar additionally rejects duplicate operation IDs across core and module routes; a regression test failed before that guard was added.

All module callbacks execute inside `withTenant`, with a single registry frame providing their own repository and bound services/capabilities. Output validation finishes before committing JSON responses, and management responses use `no-store`. Raw input values are passed back to the captured module schema after host validation; this preserves schema transforms without parsing an already-transformed value again. The bridge currently supports JSON request bodies. Domain-specific form content types and additional resource namespaces arrive with their domain milestone as additive contract extensions.

Public hooks require an injected public authorization port; absent composition returns a safe 503 before a domain transaction. P1.9 supplies credential/origin/abuse/PoW integration at this port. No anonymous fallback or new unscoped key lookup is introduced. There are no complete domain definitions in the production M1 catalog, so this bridge does not advertise placeholder domain APIs.

The [worker hand-off](../../apps/server/src/module-jobs.ts) exposes only selected registered jobs, retaining their module identity, payload schema, retries, bounded retention and optional cron. Execution binds the trusted worker envelope's tenant to `withTenant` and a new registry frame. HTTP and worker composition use the same job list; pg-boss registration, validation of queue envelopes, retries and cron delivery remain P1.10. Privileged module repository factories can be injected only at server composition and never reach module callbacks.

The [scope catalog](../../packages/core/src/keys/scopes.ts) merges selected module declarations with the existing core/built-in catalog. The same snapshot is supplied to creation schemas, key service and secret authentication. Built-in ownership cannot be replaced, disabled/unknown grants fail, and presets retain their explicit rights without inheriting new module scopes. Inputs are copied to resist alias mutation. The existing audit-safe bound of 100 scope entries is now one key-owned constant shared by issuance, metadata and audit/events, so a larger catalog cannot create an unauditable grant list. A boundary regression failed before this shared limit was applied.

## Evidence and consequences

`bun test apps/server/src/module-routes.test.ts` runs a synthetic module over actual HTTP, PostgreSQL, verified dashboard sessions and key authentication. It covers project isolation, roles, module-specific scopes, input transforms, body limits, output allowlists, OpenAPI/inventory registration, absent public authorization and registered job execution. A real audit constraint proves HTTP and job usage mutations roll back. Denied requests preserve the fixture's complete tenant-data snapshot. Tenant-selector shadowing fails startup.

`bun test packages/core/src/keys/scopes.test.ts apps/server/src/http/api-routes.test.ts` covers merged scope ownership, disabled/unknown rights, unchanged presets, alias snapshots, grant bounds and global operation-ID collisions. Together with ADR-0038's all-subset/provider/metadata tests, these complete P1.6b's backend boundary. Dashboard consumption stays in P1.11b/P1.12 using generated API types; real storage/scanner readiness belongs to their adapter tasks. No queue daemon, domain schema, handwritten dashboard API type or production public bootstrap is added here.
