# ADR-0066: Read-only public resource lookups

- **Status:** accepted during execution; end-of-milestone maintainer review deferred by explicit instruction
- **Date:** 2026-11-15
- **Related:** ADR-0063; P3.3a; I1/I10/I12/I13

## Context

A resource-bound public write must find its instance before the instance's abuse policy can be applied. A repository method can mutate data even when a TypeScript callback has no service access. No pre-proof mutation may commit.

## Decision

The host prepares public instance binding inside a tenant frame flagged `readOnly`. The database adapter sets `SET TRANSACTION READ ONLY` before its first query. The flag is trusted composition state, never HTTP input. A module resolver receives only its own scoped repository and clock, with a bounded, schema-validated JSON payload. No capabilities, transaction handle, queue or other services are exposed. Resolvers are restricted to JSON public writes.

The guard checks origin before invoking the locator. The normal write transaction subsequently checks credentials, active instance/config version, origin, proof, limits and the module's locked resource/token validation. The read-only flag grants no access and does not change the authentication bootstrap.

## Consequences

Database write attempts during binding fail and roll back, including accidental calls to mutation methods on the module repository. Connection reuse restores normal transaction behavior. Existing keyed public routes use the same read-only preparation frame. Object I/O and job enqueue remain unavailable to locators.
