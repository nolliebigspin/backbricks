# ADR-0038: Module catalog and availability metadata

- **Status:** accepted
- **Date:** 2026-11-06
- **Task:** P1.6b; ARCHITECTURE §C.7; ADR-0019/0037; approved Q5

## Context

The M1 image ships domain infrastructure declarations but no forms/upload/review API implementations. Treating every selected declaration as a working module would advertise nonexistent APIs. Duplicating environment, metadata and server selections would make their availability drift.

## Decision

The [`moduleCatalog`](../../apps/server/src/modules.ts) contains either complete registered definitions or explicit [descriptors](../../packages/core/src/modules/catalog.ts). Each domain package owns its descriptor, localized names, primary resource names and infrastructure. Existing infrastructure exports remain the same single source. Descriptors contain no fake config schema or handler. Environment validation receives the catalog's derived infrastructure map; the existing empty/unset `BACKBRICKS_MODULES` meaning (all available) remains unchanged. A core-only installation is an empty catalog, or an explicit empty selection at the internal registry boundary.

Selection validates names, filters complete definitions before registry validation and derives public metadata. Descriptors never supply routes, jobs, scopes or capabilities. Their `enabled` flag reports configuration selection; `operational` is true only for a selected complete definition. Both flags are false for disabled entries. Complete definitions still undergo dependency/provider checks from ADR-0037. Selection and JSON declarations are snapshots; caller alias changes cannot alter future selection. Runtime HTTP/worker composition binds the selected registry to its own provider lifetime.

[`GET /v1/meta`](../../apps/server/src/routes/meta.ts) returns only module type, localized display name, primary resource names and these availability flags. The same projection is added to project integration metadata. It contains no tenant data, infrastructure credentials, deployment mode or private settings. Responses use `no-store` so restarting with another selection does not leave a cached availability claim. Dashboard consumption uses the generated contract/admin client in P1.11b/P1.12 rather than a parallel handwritten client type.

Recognized primary module namespaces whose implementation is unavailable return `404 module_not_enabled` with a fixed hint. The [fallback](../../apps/server/src/errors.ts) matches installation-wide resource prefixes without querying or echoing tenant/resource identifiers. Unknown namespaces remain the normal 404. This does not create an undeclared management operation: there is no handler or data access for an unavailable module. Additional domain resource namespaces will be declared with their domain APIs in M2–M4.

## Evidence and remaining wiring

`bun test packages/core/src/modules/catalog.test.ts apps/server/src/meta.test.ts` covers all eight synthetic subsets, empty installation, declared route/job absence, storage configuration only when selected, provider binding, unknown selection, descriptor alias mutation, public metadata snapshots and safe unavailable-module responses. The live integration-read test compares project availability to the public endpoint while retaining existing tenant/scope/private-field checks.

This is the selection/metadata step of P1.6b. Operational HTTP route mounting, worker registration hand-off and the remaining fixture startup tests must finish before ticking the task. Actual S3 readiness belongs to P1.8e and queue execution to P1.10; no placeholder success probes or working domain APIs are claimed here.
