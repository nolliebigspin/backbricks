# ADR-0048: Transactional PostgreSQL jobs

- Status: Accepted
- Date: 2026-11-06
- Task: P1.10a

## Decision

The [pg-boss adapter](../../packages/db/src/queue.ts) uses pg-boss 12.38.1 and the existing node-postgres pool. PostgreSQL transaction bindings belong in `packages/db`, alongside the scoped repository factories. A private WeakMap binds each live opaque tenant handle to its physical Drizzle transaction; it is released when the callback ends and is never exported from the package entry point. Modules keep the existing core Queue contract and cannot obtain the driver or forge a binding.

[Queue definitions and envelopes](../../packages/core/src/jobs/contract.ts) are validated once from the selected registry. The producer validates payloads and persists the original JSON wire shape, so transforms run once when invoking the typed callback. Tenant IDs come exclusively from the caller transaction. Unknown/disabled job names and invalid payloads fail closed. Deterministic, tenant/queue-bound UUIDs implement optional singleton identities; the Queue contract explicitly returns null for an existing job.

Enqueue uses pg-boss's [official Drizzle transaction adapter](https://pgboss.io/api/adapters), not a separate connection. A commit makes both domain changes and the job visible; rollback makes neither visible. The worker validates the stored envelope/payload again, opens `withTenant`, invokes the registered callback and completes the queue job through that same physical transaction. Callback side effects and completion therefore commit or roll back together. Retried database work does not leave duplicate committed increments after a failed attempt. External effects remain at least once and require their own delivery semantics.

Each registered queue has two local consumers, a 60-second active timeout, bounded declared retries with exponential backoff, and declared retention/deletion periods no longer than the core maximum. Polling uses the library's supported 500 ms minimum. Queue policies are updated at startup, so a deployment does not silently retain old defaults. Errors reported to logs and stored by pg-boss contain only a static failure message and the registered job name; payload/driver errors are not copied.

[Process composition](../../apps/server/src/roles.ts) now starts a real queue producer in serve and consumers in worker/all. The combined role shares one database pool, provider container and queue lifetime. Shutdown stops HTTP intake and drains auth/security work, then drains active jobs (including their follow-up enqueue), closes providers and finally the pool. The 65-second queue drain fits inside the 75-second process guard. Scoped cron fan-out and housekeeping are P1.10b/c.

## Evidence

The [real PostgreSQL tests](../../packages/db/src/queue.test.ts) use a one-connection pool to prove enqueue/completion share the transaction without pool reentry. They cover committed/rolled-back enqueue, singleton deduplication, disabled/invalid payloads, expired handle rejection, failed-attempt rollback/retry, tenant isolation, sanitized job output, and graceful drain with a follow-up job. [Fresh process smoke tests](../../apps/server/src/main.test.ts) exercise serve, worker and all startup/SIGTERM/SIGINT on Bun. No database mock is used.
