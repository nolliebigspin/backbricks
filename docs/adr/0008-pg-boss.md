# ADR-0008: Background jobs with pg-boss

- **Status:** accepted
- **Date:** 2026-11-04
- **Related:** ARCHITECTURE §0 #7, §A.4, §C.4, §H; PLAN P0.9a, P1.10

## Context

The platform needs background work: malware scans, emails, the outbox dispatcher, retention purges, cleanup and usage aggregation, including cron schedules. Jobs should be enqueued in the same transaction as the data change that triggers them.

## Decision

**pg-boss on PostgreSQL runs all jobs and cron schedules.** The `worker` role (or `all`) processes them; modules register job definitions through the module contract.

## Consequences

- No extra service (no Redis); jobs live in the same database and can be enqueued transactionally.
- Throughput is bounded by Postgres, which is fine for the assumed load (ARCHITECTURE §1 A1).
- pg-boss declares `node >=22.12`; Bun compatibility is verified in the P0 spike (ADR-0020), with running the worker on Node as the fallback.

## Alternatives considered

- **BullMQ:** needs Redis. Rejected.
- **Graphile Worker:** also Postgres-based and solid, but pg-boss has built-in cron and a simpler API for this use. Rejected.
