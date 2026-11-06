# ADR-0042: Configuration documents and bound plans

- **Status:** accepted
- **Date:** 2026-11-06
- **Tasks:** P1.7c; P1.7d uses the same planner/token contract

## Decision

The [document schema](../../packages/core/src/configuration/schemas.ts) is the single envelope contract: `$schema`, a project TypeID and `modules`. Each module section uses its declared plural resource name; each instance key maps to `{ name, status, moduleVersion, configVersion?, config }`. Keeping module config under `config` prevents collisions with envelope fields. Existing instances require their current `configVersion`; new instances omit it. The module schema owns config validation/defaults and version migration. This refines the unimplemented flat example in §D.8; no shipped API/client format is removed.

GET project config exports operational module configuration only: no credentials, recipients, personal records, audit or actor IDs. Read/dry-run require a member session or config-read grant. Omitted sections preserve those modules' state. An explicitly present empty section plans archival of its active/paused configurations; archive remains destructive and preserves reserved keys/history. Unknown, disabled or descriptor-only sections fail rather than deleting anything. Archived keys cannot be silently recreated.

The [pure planner](../../packages/core/src/configuration/planner.ts) sorts section/instance keys, validates project and format/version preconditions, normalizes defaults/migrations and reuses module change classification. Equivalent normalized documents produce the same diff. Planning does not lock for writes, increment versions, invoke retention or write any activity. It may observe a changing base while paginating; apply must reject any resulting stale base under its project lock.

`PUT …/config?dryRun=true` accepts `{ config }` and returns structural changes, destructive warnings, expiry and `planHash`. The [plan token](../../packages/core/src/configuration/plan-token.ts) is a purpose-separated HMAC over an expiring digest. That digest binds organization/project, the principal ID and effective permissions, normalized desired configuration, every persisted instance's identity/version/status, and the selected module/schema versions. Tokens contain only a digest and expiry, not configuration or identities. Signature verification uses constant-time comparison. Lifetime is ten minutes through the injected clock. No token cache or new infrastructure is needed.

P1.7d must recompute that exact binding under the active project lock and reclassify permissions before writing. A token cannot substitute for current authentication, config-write permission or destructive permission. Expired, altered, cross-tenant/principal, changed-schema or stale-state bindings fail closed; a failed transaction cannot partially apply a plan.

## Evidence

`configuration.test.ts` proves actual HTTP/Postgres config export/dry-run perform no writes, omit key/email data, retain omitted sections, classify explicit removals, reject unavailable sections and normalize equivalent input. Every config management operation joins the automatic isolation suite. Core property tests permute instance ordering, while token tests cover expiry, tampering, changed bindings and wrong signing secrets.
