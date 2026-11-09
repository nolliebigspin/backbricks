# ADR-0050: Bounded worker maintenance

- Status: Accepted
- Date: 2026-11-06
- Task: P1.10c

## Decision

The [maintenance repository](../../packages/db/src/repositories/maintenance.ts) is a worker capability held by the queue runtime, absent from HTTP/module service views and ordinary tenant repositories. It deletes at most 100 expired rows per table/transaction using locked batches with `SKIP LOCKED`. Global technical/auth cleanup covers rate buckets, PoW/auth replay claims, expired sessions, verification records and invitations. Active identities, credentials and memberships retain their approved lifecycle (Q8).

Audit, outbox and idempotency cleanup always use an org-scoped `withTenant` transaction, including rows belonging to archived projects. Authenticated request contexts are rejected by the maintenance capability. Audit deletion sets the existing trigger override transaction-locally, deletes only rows expired at the injected clock and turns it off before returning. An error rolls back both deletion and the local setting. The database trigger independently rejects all updates and deletion before its own transaction timestamp; a clock ahead of PostgreSQL therefore fails closed. No general append-only bypass is added.

[Job housekeeping](../../packages/db/src/queue-cleanup.ts) applies the vendor's absolute `keep_until` bound to all job states, including failed mail and erasure jobs. This prevents failed personal/token-bearing payloads from receiving another full retention window after their final attempt. Successful/expired mail still deletes its payload immediately (ADR-0049). A one-minute cleanup cadence adds scheduling granularity to the one-day delivery bound. Generated auth tables remain untouched; a [custom migration](../../packages/db/migrations/20261106124449_maintenance_expiry/migration.sql) owns the expiry indexes.

[Scheduled callbacks](../../packages/db/src/queue-schedules.ts) carry a stable run ID and validated continuation cursor in durable jobs. A page can enqueue the next page; a full deletion batch can repeat immediately. Cursor continuations use stable IDs, so callback retries do not duplicate the retained next page. This replaces ADR-0049's initial in-memory org cursor. A process restart may repeat idempotent cleanup, but cannot discard a committed continuation.

[Project/instance fan-out](../../packages/core/src/jobs/tenant-maintenance.ts) is paginated through the existing scoped repository/cursor contracts. A trusted project-enqueue port verifies the project in the same org transaction; modules retain only the queue capability bound to their own context. Each project schedules retention and expected-version migrations. Disabled modules are skipped. Optional module cron jobs fan out only to active projects; registration requires their schema to accept an empty wire payload, including declared defaults, rather than inventing missing inputs. There is no HTTP scheduling or erasure endpoint.

The [worker composition](../../apps/server/src/maintenance.ts) runs technical/tenant expiry every minute, project retention/config migration hourly and selected module cron declarations on their own schedules. Every page/batch is bounded. Expired jobs and audit/history records are hard-deleted; no content is moved into another long-lived store.

## Evidence

[Real DB cleanup tests](../../packages/db/src/maintenance.test.ts) cover concurrent bounded batches, exact expiry boundaries, preservation of current identities/data, archived projects, tenant separation, failed-purge rollback, nonleaking audit settings and failed-mail hard deletion. [Fan-out tests](../../apps/server/src/maintenance-fanout.test.ts) cross 100 projects and 100 instances and prove durable cursors, scoped identities, retry deduplication and disabled-job exclusion. [Scheduler tests](../../packages/db/src/queue-schedules.test.ts) execute real continuation/repeat jobs with the same run ID and reject malformed stored payloads without exposing them in errors. The core contract rejects cron definitions that cannot validate their empty input.
