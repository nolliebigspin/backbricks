# ADR-0007: PostgreSQL 18 with Drizzle ORM

- **Status:** accepted
- **Date:** 2026-11-04
- **Related:** ARCHITECTURE §0 #6, §B, §H, §J.2 #7; AGENTS.md I1; PLAN P0.6, OPEN_QUESTIONS Q1

## Context

The platform needs relational data with JSON fields, full-text search for submissions, advisory locks for migrations, a job queue, rate-limit storage and, later, row-level security. Self-hosters should run as few stateful services as possible.

## Decision

**PostgreSQL 18 is the only stateful core dependency. Drizzle ORM with the `pg` driver accesses it, and drizzle-kit generates SQL migrations** that are reviewed and committed (`packages/db/migrations`). Module tables are defined in module packages but migrated in one central history. Migrations are forward-only and run under an advisory lock.

## Consequences

- One database also serves the queue (ADR-0008) and the rate limiter; no Redis.
- SQL-near queries with good types; migrations are plain SQL a human can review.
- One driver (`pg`) shared with pg-boss.
- We start on the Drizzle 1.0 release candidate (`1.0.0-rc.5`, OPEN_QUESTIONS Q1). That avoids converting the migration history to 1.0's new folder format later, at the cost of tracking RC changes until 1.0 GA. Versions are pinned exactly and each upgrade is checked against the changelog.

## Alternatives considered

- **MySQL / SQLite:** weaker JSONB, full text or RLS, or no multi-process story. Rejected.
- **Prisma:** heavier runtime, generated client, less SQL control. Rejected.
- **Kysely:** good query builder, but schema and migrations would be separate tools. Rejected.
