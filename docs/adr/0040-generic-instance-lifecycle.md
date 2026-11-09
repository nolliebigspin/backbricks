# ADR-0040: Generic instance lifecycle

- **Status:** accepted
- **Date:** 2026-11-06
- **Task:** P1.7a; ARCHITECTURE §B.5/§C.2/§D.2/§F.4; approved Q5/Q7/Q9

## Context

The platform has scoped instance/revision repositories and operational module definitions, but no generic instance API. Direct config changes must retain the same destructive permission boundary as config-as-code, avoid lost concurrent updates and preserve the approved distinction between configuration archive and personal-data erasure.

## Decision

The [core instance service](../../packages/core/src/instances/service.ts) owns create/list/read/update/archive. The [host routes](../../apps/server/src/routes/instances.ts) generate the five management operations under each selected operational module's declared plural resource. Descriptors alone expose no CRUD; production M1 still has no working domain API. Modules retain their own configuration schema/defaults and destructive-change classifier. No domain configuration is invented for M1.

The central registrar compares route patterns independently of parameter names, so a module hook cannot shadow generated CRUD by calling its parameter `{id}` instead of `{key}`. Such collisions fail startup. A regression test demonstrates the previously accepted duplicate and the guard.

[Input schemas](../../packages/core/src/instances/schemas.ts) allow a key, display name, active/paused status and module configuration. IDs, tenant selectors, module/config versions and timestamps are service-owned; keys are immutable and unique within project/module, including archived configurations. Duplicate keys produce a safe 409 through the existing database unique constraint. The repository's new archive filter applies before pagination/look-ahead, while internal maintenance can still read archived configurations.

PATCH requires the currently observed `configVersion`. Its configuration uses JSON Merge Patch: omitted members survive, null removes an object member, and arrays/scalars replace their prior value. The resulting whole configuration passes the module's validator before classification. Prototype-shaped property names remain ordinary own JSON data. Unknown configuration fields, malformed keys and caller-supplied identity fields fail validation. The HTTP envelope uses a JSON refinement with an opaque static type because recursive Zod JSON types exceed Hono's type expansion and its OpenAPI generator cannot traverse lazy schemas. Module-owned JSON Schema remains the source of detailed configuration shape; schema export is P1.7d.

Every effective mutation increments `configVersion` once and inserts a revision, including display-name/status changes. Revisions snapshot config/module versions and the attributable actor; name/status changes are identified structurally in audit metadata. Creation starts at version 1; unchanged patches produce no revision or activity, and stale preconditions fail with 409 even when the requested value now matches. Versions are bounded by PostgreSQL's positive integer range. Mutations lock the active parent project, serializing with project archival and the future project-wide apply operation, and retain repository compare-and-swap as a final conflict guard. Reads require an active parent. Persisted migration and rollback semantics remain P1.7b; updates refuse a mismatched module version rather than silently rewriting it.

[Configuration permissions](../../packages/core/src/instances/permissions.ts) are shared between HTTP declarations and service enforcement. Reads accept member sessions or `config:read`; writes require owner/admin sessions or `config:write`. A changed configuration uses the module classifier, whose existing default treats unclassified changes as destructive. Destructive key writes additionally require `config:destructive`; that grant alone never permits a write. Status PATCH accepts only active/paused. DELETE requires the current version and destructive rights, then changes status to archived, retains revisions and reserves the key. Archived configurations are unavailable through CRUD and cannot be reactivated. It neither deletes personal records nor claims erasure; the complete hard-erasure lifecycle is required before M2, as already agreed in Q7/ADR-0030.

Instance, revision, structural audit and event-outbox writes use the caller's one tenant transaction. A changed configuration also invokes the module's retention recomputation hook through its restricted runtime in that transaction; hook writes roll back on any later failure. Audit/events contain only instance IDs/versions and changed envelope-field names, never configuration values or readable instance names. Platform event names live in `CORE_EVENTS`. Constraint-specific duplicate translation is shared with project repositories rather than copied. The shared API registrar now owns `Cache-Control: no-store` for management operations, replacing repeated key/activity/module handler assignments and covering generated configuration responses and errors.

## Evidence and consequences

- `bun test apps/server/src/instances.test.ts apps/server/src/instances.security.test.ts` uses actual HTTP, dashboard sessions, issued keys, PostgreSQL and Mailpit. It covers defaults, invalid config, merge semantics, pagination, no-ops, concurrent duplicate creation and stale writes, archival/key reservation, explicit destructive grants, conservative default classification, direct service permissions and inactive/unknown parent/module behavior.
- `bun test apps/server/src/tenant-isolation.test.ts` runs all five generated operations through the existing manifest coverage detector with a synthetic module, foreign organizations/projects/keys and unchanged-state denial snapshots. Shared snapshots now include configuration and revisions.
- Real database constraints independently fail revision, audit and event persistence for create/update/archive; every failure rolls back configuration, revisions, retention-hook usage writes and all activity. Existing module-route and project tests cover the reused HTTP/cache/unique-conflict boundaries.
- `bun test packages/core/src/instances/merge-patch.test.ts` checks object/array/null semantics, input preservation and prototype-shaped keys.

Revision history/rollback, config planning/apply, domain data erasure and production domain endpoints remain their planned tasks. This decision introduces no deletion of personal records, module dependency or infrastructure.
