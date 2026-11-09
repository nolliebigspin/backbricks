# ADR-0059: Notification rules and outbox dispatch

- **Status:** accepted during execution; D57 awaits maintainer confirmation
- **Date:** 2026-11-09
- **Task:** P2.6a; Q14, ADR-0022/0049; I1/I3/I4/I11/I12/I19

## Context

The M1 `notification_rules` table stored copied email addresses in `recipients`. Q14 limits recipients to verified organization members, and ADR-0022 says recipient configuration is hard-deleted on member removal. Copied addresses would outlive the membership and could not be told apart from member IDs. Rules also need a delivery trigger that works for any module event without the core knowing module data.

## Decision

The [migration](../../packages/db/migrations/20261109081104_bright_freak/migration.sql) renames the column to `recipient_user_ids` and clears/disables any pre-API rows, since no API could create them before. CHECKs bound recipients (20) and the per-rule hourly limit (1–100, default 10, D49), and forbid an enabled rule without recipients. Addresses are resolved from active, verified memberships of the caller's organization only when choosing (`GET …/options`) and, from P2.6b, at send time. Rules, audit, events and jobs never hold an address.

The [core service](../../packages/core/src/notifications/service.ts) is admin-session-only (`requireSessionRole`, now shared with key management). It accepts only event types from enabled modules, instance bindings of the same module that are not archived (others are `404`, I2), and verified members of the organization. Every write takes the organization lock that membership changes take, so validation cannot race a removal. Create/update/delete audit and publish content-free `changedFields` in the same transaction (I12). Member removal (the only membership-ending auth endpoint) removes the user from every rule in the organization inside the auth mutation's tenant transaction and disables rules that end up empty; its audit records the count.

Dispatch follows the outbox consumer contract (ADR-0049). Platform job handlers may now declare `consumes`, and the server wiring keeps it. The [dispatch handler](../../packages/core/src/notifications/jobs.ts) consumes every registered module event. Per event it locks the project, skips deleted projects and missing/archived/foreign-module instances, and enqueues one ID-only delivery job per matching enabled rule (global or bound to the instance). Rules are read in bounded pages (`MAX_MAINTENANCE_BATCH`) with an opaque continuation job. Singleton keys (`event:rule`, `event:cursor`) make retries and replays idempotent. All enqueues share the job's completion transaction.

## Evidence

[Rule tests](../../apps/server/src/notification-rules.test.ts) cover verified-member selection, foreign/unverified recipients, unknown events, foreign instances, options privacy, audit rollback for create/update/delete/member removal, and that no address reaches audit, events or logs. [Dispatch tests](../../apps/server/src/notification-dispatch.test.ts) cover matching, enqueue rollback, duplicate runs, 102 rules over two pages and archived sources. The [isolation suite](../../apps/server/test/isolation/notification-cases.ts) covers all five routes with cookies; denied-write snapshots include rules. No new infrastructure, dependency or invariant change.
