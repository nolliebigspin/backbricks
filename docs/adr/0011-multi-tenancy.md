# ADR-0011: Shared-schema multi-tenancy with withTenant, RLS later

- **Status:** accepted
- **Date:** 2026-11-04
- **Related:** ARCHITECTURE §0 #10, §B.1, §B.6, §J.2 #1; docs/CLOUD.md §1; AGENTS.md I1–I3; PLAN P0.6, P1.3, P1.13, C1.4

## Context

Agencies run many organizations and projects on one instance, and the cloud hosts many customers. A cross-tenant leak is an existential risk (ARCHITECTURE §J.1 #2). The solution must be cheap to run and hardenable later without a data migration.

## Decision

**One database and schema for all tenants. Every tenant table has `organization_id` and, if project-scoped, `project_id`. Tenant tables are accessed only through `withTenant(ctx, fn)`,** which opens a transaction, sets `app.org_id`/`app.project_id` as transaction-local settings and hands out repositories that always scope queries. Other tenants' resources return `404`. **Postgres row-level security is added as a second line of defense in the cloud phase** (C1.4), using the same settings.

## Consequences

- No per-tenant schemas or databases to manage.
- Isolation depends on discipline, so it is enforced by architecture rules and an automated isolation suite that covers every management route (P1.13).
- RLS can be enabled later without moving data, because the settings are already in place.
- Settings are set with `set_config(…, true)` and bind parameters, not string-built `SET LOCAL`.

## Alternatives considered

- **Schema or database per tenant:** strong isolation but heavy migrations and operations. Rejected for now; possible for enterprise later.
- **RLS from day one:** more friction during early development (roles, testing). Deferred to C1.
