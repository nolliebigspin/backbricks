# ADR-0032: Session-only key management

- **Status:** accepted
- **Date:** 2026-11-06
- **Task:** P1.4b; approved Q9 permission matrix

## Context

Safe key material alone does not enforce who may mint credentials, prevent repeated disclosure, or make revocation auditable. Those guarantees must hold at the HTTP and service boundaries.

## Decision

[Key routes](../../apps/server/src/routes/keys.ts) expose list/create/revoke under the active project. Every operation requires an owner/admin dashboard session; member sessions and bearer credentials cannot manage keys, including a bearer accompanied by an authorized cookie. The [key service](../../packages/core/src/keys/service.ts) repeats the session/role requirement so later non-HTTP callers cannot bypass I7. Management metadata belongs to authorized administrators; public integration metadata uses its separate later endpoint.

[Creation schemas](../../packages/core/src/keys/creation.ts) require a deliberate expiry choice (future ISO timestamp or null) and, for secret keys, exactly one preset or explicit nonempty scope list. Separate strict union branches represent that choice in OpenAPI as well as runtime validation. Publishable keys accept no secret grants. No scope, actor/parent ID, hash or token can be supplied through an undeclared field. Labels reject the secret-key prefix to avoid accidentally naming a key with a credential. Disabled-module-only presets cannot issue an empty secret key.

Creation persists only the material projection, writes structural scope/preset audit and event metadata in the same tenant transaction, and reveals the token only after commit. Key names, tokens and lookup hashes never enter audit/outbox metadata. The response has `Cache-Control: no-store`. Listing uses the existing bounded keyset helper and explicit safe metadata projection: it may return a public token, never a secret or hash. No endpoint redisplays a secret.

Revocation locks the scoped row, writes its timestamp and audit/event atomically. A repeated or concurrent revocation is a no-op after the first commit, with no duplicate activity. A foreign organization/project/key ID resolves through scoped repositories to 404. Archived project parents remain inaccessible.

## Evidence and consequences

`bun test apps/server/src/keys.test.ts apps/server/src/tenant-isolation.test.ts packages/core/src/keys/creation.test.ts packages/db/src/key-service.test.ts` covers owner/admin/member/key policies, sibling/foreign child IDs, strict grants/expiry, reveal-once/list projections, pagination, concurrent revocation and no-op repeats. Test-only check constraints force audit and outbox failure independently for creation and revocation; snapshots now include scoped key metadata as well as project/identity/activity state. A real DB service test verifies non-session/member callers and disabled-module-only presets write nothing.

All three operations have matching cases in the automatic route inventory suite. OpenAPI generation includes the real key operations. HTTP bearer tests still use the explicit fixture resolver: production hash discovery, last-used updates, exposure rejection/audit and security notification intent remain P1.4c. Dashboard reveal/clipboard flows remain P1.12c.
