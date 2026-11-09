# ADR-0041: Revisions and configuration migrations

- **Status:** accepted
- **Date:** 2026-11-06
- **Task:** P1.7b

## Decision

The [instance service](../../packages/core/src/instances/service.ts) exposes bounded revision history, individual stored revisions, rollback and explicit persisted migration through generated management routes. All use the existing configuration permissions and scoped instance lookup before revision lookup. Historical revisions are never rewritten.

HTTP history omits actor IDs: configuration-read grants do not grant access to personal identity data. Attribution remains in internal revisions and the separately protected audit surface.

Lazy instance reads and lists validate/migrate a configuration in memory only. The returned `moduleVersion` describes that view; `storedModuleVersion` identifies the persisted format. `configVersion` remains the actual persisted precondition. No read increments versions, audits, publishes events or invokes retention writes. Revision reads expose the original stored format. Unsupported future formats, missing migration hooks and invalid migrated output fail safely.

Modules must implement deterministic, pure migrations of the supplied historical format into their current schema. Explicit `POST …/{key}/migrate`, ordinary updates of an older format and rollback persist through the [shared mutation path](../../packages/core/src/instances/persistence.ts). That path locks the active project, checks the caller's expected version, recomputes retention, inserts a revision and writes audit/outbox metadata in the same transaction. Persisting a format migration is conservatively destructive; a key needs both write and destructive grants. Repeating a migration of the current format is a no-op.

`POST …/{key}/revisions/{version}/rollback` accepts the current config-version precondition, migrates the selected historical config through the current module schema, classifies the actual replacement against the current view and always creates a new revision. It restores configuration; name/status and historical rows remain unchanged. A revision is addressed by its parent instance and version, so a different tenant/instance's history cannot be applied. Background migration scheduling belongs to P1.10b and must use this same persistence boundary.

## Evidence

Real HTTP/PostgreSQL tests in `apps/server/src/instance-versions.test.ts` prove lazy reads are write-free, invalid/future formats fail, an outbox failure rolls back migration/retention/revisions/audit, repeated persistence is idempotent, old-format rollback creates fresh immutable history, and concurrent requests cannot overwrite one base version. All four generated operations join the automatic tenant-isolation suite.
