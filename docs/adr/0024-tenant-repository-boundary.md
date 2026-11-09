# ADR-0024: Tenant repository boundary

- **Status:** accepted
- **Date:** 2026-11-06
- **Related:** I1/I2/I13; ADR-0011/0021/0023; P1.3a; ARCHITECTURE §B.6/§C.3

## Context

The P0 `withTenant` skeleton set transaction-local parameters but exposed an unrestricted Drizzle transaction. Parameters alone do not filter queries while RLS is deferred. A repository captured from a callback must also not execute after its connection has returned to the pool.

## Decision

`createWithTenant` snapshots the trusted context, opens a transaction, binds its settings and returns an immutable `TenantTransaction` with an opaque identity, core repositories and bound module repositories. No driver crosses that callback boundary.

- Repository predicates always include organization and, where bound, project. Project-child repositories require a project context; organization-wide activity/project reads are explicit. A bound project must exist in the organization and be active before the callback runs. Foreign resource lookup is not-found.
- Input tenant columns are stamped from the snapshot, never accepted from caller data. Update schemas explicitly select writable fields and reject reassignment. Read models derive from core Zod schemas; ORM models remain db-owned and do not leak into core or clients.
- Repository methods execute before resolving their promises, not by returning a lazy query to domain code. A transaction-lifetime guard rejects captured repositories after callback completion, on success and failure. Driver settings are transaction-local; context mutation cannot rebind existing repositories.
- Composition may inject module repository factories. These factories are the trusted data-layer seam: they receive the same transaction, immutable context and lifetime guard, and must live in a module's repository implementation. Modules may augment the core repository interface map with their own contracts. Domain/capability calls use those bound contracts and the same transaction identity, never a raw driver or a second transaction. Static composition is not runtime plugin loading.
- An existing auth transaction can be passed as the runner; `withTenant` then uses a nested savepoint on the same connection. Tenant audit/repository work cannot commit independently of the enclosing auth operation, and domain callbacks still receive no driver. The real DB rollback test covers this enlistment.
- An architecture rule rejects imports of tenant schemas outside schema/repository code and tests. Auth's generated identity schema is an explicit exception for the ADR-0021 identity/composition boundary. Raw SQL must still be reviewed: import rules cannot prove the semantics of arbitrary SQL strings. Module factories must scope their own tables and use the provided lifetime guard; domain route code cannot import table definitions.
- `withTenant` accepts a **trusted** context; it does not authenticate membership or grant roles/scopes. Request identity and authorization are P1.3b/P1.4c. Auth credential bootstrap and maintenance remain narrow composition/data-layer operations, never an unrestricted repository exposed to requests.

## Evidence

Real Postgres fixtures use two organizations with two projects each. Tests prove scoped lists/lookups across core repositories, foreign-project callback rejection, safe write stamping, update reassignment rejection, bounded keyset pagination, context snapshotting, and escaped-handle rejection. A synthetic capability/repository write and a core project insert roll back together. A deliberately illegal route→table import fails the architecture fixture.

## Consequences

- Service contracts remain independent of Drizzle; changing persistence does not change domain request handlers.
- Repository methods provide isolation, not permission policy or automatic audit. Administrative services must still authorize and write audit/outbox through the same transaction (P1.8a onward).
- Adding a repository requires scope/lifetime tests and a core contract. Module definitions will register repository bindings alongside capabilities at composition in P1.6; no domain schema is added for this proof.

## Alternatives considered

- **Keep the raw transaction and rely on settings:** insufficient without RLS; rejected.
- **Global mutable tenant context:** concurrent request scope risk; rejected.
- **A universal table/CRUD engine:** hides domain constraints and expands scope; repositories remain specific to their owners.
