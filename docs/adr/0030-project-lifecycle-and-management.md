# ADR-0030: Project lifecycle and management

- **Status:** accepted
- **Date:** 2026-11-06
- **Tasks:** P1.5a; Q7/Q9 explicitly approved by the maintainer

## Context

The architecture described both soft deletion of project configuration and hard erasure of projects. The maintainer approved M1 configuration archival, with personal-data erasure as a separate workflow before M2 release, and approved the management permission matrix in Q9.

## Decision

- [Project routes](../../apps/server/src/routes/projects.ts) expose active project list/create/detail/update/archive. Listing/creation/archive are session-only; reads require a member session or a bound `integration:read` key, updates require an admin session or a bound `project:write` key. Owner satisfies admin requirements. Exact declarations are part of the same route manifest used by authorization, OpenAPI and isolation tests.
- DELETE archives configuration, responds 204 and immediately makes the project inaccessible through active-project repositories. It does not erase personal records or revoke individual key rows, and is not presented as an erasure API. No restore or hard-erasure endpoint is exposed. Organization erasure/ownership transfer remain disabled. Before releasing M2, implement and verify the separate personal-data hard-erasure workflow, including objects, jobs and retained audit history.
- [Project service](../../packages/core/src/projects/service.ts) locks an active project before update/archive. Data, structural audit and event outbox writes share the caller's tenant transaction. No-op updates create no activity. Archive preserves history; repeated archive/read/update returns 404. Project-bound `withTenant` rejects archived parents, including requests using a still-known credential. Production key discovery (P1.4c) must also resolve only active projects; public route composition (P1.9) must retain this gate.
- Creation uses an organization-bound context, so its audit/event tenant project column is null and its target/subject identifies the new project. Updates/archive use the bound project context. This keeps one transaction and avoids inventing a privileged scope-rebinding API. Organization activity can show all three actions.
- [Write schemas](../../packages/core/src/projects/schemas.ts) own names, slugs, normalized origins and reserved settings. Settings accept only `{}` until a feature introduces typed fields; there is no arbitrary configuration store. IDs, parent tenant, timestamps and lifecycle fields are service-owned. Duplicate slugs within an organization produce a safe 409, including concurrent inserts; archival reserves the slug. The same slug in another organization is permitted.
- [Origin validation](../../packages/core/src/http/origins.ts) accepts only explicit HTTP(S) origins and compares canonical origins exactly. An empty list retains the architecture's all-valid-origins meaning, without granting authentication. Management responses expose no CORS permission. Public CORS implementation remains P1.9b.
- [Pagination](../../packages/core/src/http/pagination.ts) derives bounded keyset positions from timestamp/TypeID, with one internal look-ahead row. API page size remains bounded by `MAX_PAGE_SIZE`; returned pages never include that extra row. A cursor is an untrusted position, not authorization: tenant filters apply independently. The shared helper is introduced with the first real collection route for reuse by generic instance CRUD.

## Evidence and consequences

`bun test apps/server/src/projects.test.ts apps/server/src/projects.keys.test.ts apps/server/src/tenant-isolation.test.ts packages/core/src/http/pagination.test.ts` covers real HTTP/Postgres role/tenant isolation, strict inputs, exact origins, concurrent duplicate slugs, complete keyset traversal, immutable tenant parents, no-op updates, retained archive history and safe activity projections. Check constraints in disposable databases independently force audit and outbox failure for each mutation, proving full rollback. Key policy tests use an explicit fixture resolver; they do not claim production credential discovery/exposure auditing is implemented.

The synthetic collection probe moves under `/v1/principal-fixture/projects` so it cannot shadow the production collection. Both stay covered by the automatic suite; synthetic routes remain absent from production. The current core has no domain personal records; archive must never become indefinite retention of future module records.
