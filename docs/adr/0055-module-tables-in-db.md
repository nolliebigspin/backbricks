# ADR-0055: Module tables live in db, repository interfaces in the module

- **Status:** accepted (DEV-12, maintainer accepted Q12 on 2026-11-09)
- **Date:** 2026-11-09
- **Related:** ARCHITECTURE §B.5/§C.3/§C.5, I1/I13/I19, ADR-0023, ADR-0024, ADR-0037; P2.3a, later P3.2/P4.2

## Context

§B.5 and the §C.5 example put a module's Drizzle table in the module package. A module may import only `@backbricks/core` (I13), so its table can't reference `module_instances` for the composite live-parent foreign keys (ADR-0023), and can't reuse db's tenant columns, core-derived enums or the repository `scope` helper without copying them.

## Decision

A module **declares** its repository interface by augmenting `ModuleRepositories` from `@backbricks/core`. `packages/db` **owns** the table, its migration in the one central history and the repository implementation, registered in [`moduleRepositoryFactories`](../../packages/db/src/repositories/modules.ts). The server [composes](../../apps/server/src/module-repositories.ts) the factories of the selected modules into `createWithTenant`; that assignment is typed against the declared interfaces, so the server typecheck fails when db's implementation drifts from a module's interface or a declared repository has no factory.

- Every module table has a factory whether or not the module is enabled (all tables exist, §C.7); disabled modules get no handle.
- Factories receive the transaction's tenant scope and lifetime guard; handles fail after the transaction ends (ADR-0024). Module callbacks still see only their own repository (ADR-0037).
- Repositories stay thin: they store and query validated values. Validation, normalization and search-text extraction stay in the module.
- dependency-cruiser enforces it: tenant tables exist only under `packages/db/src/schema/` and are reached only from db's schema/repositories; modules may not import `drizzle-orm`, `drizzle-kit`, `pg` or `pg-boss` (`modules-no-database`, with a negative fixture).

## Consequences

- Module tables get the same integrity, enums and scoping as platform tables, without a shared table package.
- A module change that needs a new query touches two packages (interface in the module, implementation in db); the composition typecheck keeps them together.
- No invariant changes. Uploads (P3.2) and reviews (P4.2) follow the same seam.

## Alternatives considered

- **Module-owned tables** with FK/scope pieces moved into a new shared package or hand-written SQL: more packages and duplicated tenant plumbing; rejected (Q12).
- **Modules import db**: breaks I13 and gives modules a driver; rejected.
