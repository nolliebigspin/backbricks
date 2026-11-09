# ADR-0061: Project hard erasure

- **Status:** accepted during execution; D59 awaits maintainer confirmation
- **Date:** 2026-11-09
- **Task:** P2.7c; Q7/Q15, ADR-0030/0048/0050; I1/I9/I11/I12/I19

## Context

ADR-0030 archives projects without erasing personal data and makes archived projects unreachable through project-bound `withTenant`. Q15 requires a separate, owner-only, type-to-confirm hard erasure of an archived project before tagging `v0.1.0`. The erasure must cover module records and objects, queued job payloads and platform rows, and keep audit history valid.

## Decision

`ModuleDefinition.privacy` gains a required `eraseScope(runtime, { limit })` hook that deletes up to `limit` of the bound project's records, including stored objects, and returns the count. Every module must say how it is erased. [Forms](../../packages/modules/forms/src/module.ts) deletes entries in batches and releases linked uploads through the optional `files` capability, like every other deletion.

`POST /v1/project-erasures { projectId, confirm }` is organization-scoped, because archived projects are unreachable through project-bound routes. It is owner-session-only and accepts only an archived, not yet erased project whose slug was typed. The [service](../../packages/core/src/projects/erasure.ts) enqueues the job and audits `project.erasure_requested` in one transaction.

The job runs in a new worker-only tenant context flag, `archivedProject`. Only the queue adapter's erasure enqueue sets it in the job envelope, and continuation rounds keep it. HTTP authorization never sets it. `withTenant` then binds the archived project and rejects an active one. Each round locks the project, calls every module's `eraseScope` with 100 and queues the next round (singleton per round) while any batch was full. The last round then:

- hard-deletes the project's outbox events, idempotency keys, usage, notification rules, keys, revisions and instances;
- deletes every queued or finished job payload of the project, including notification mails, now tagged with their project (all except the running job, whose payload is only a round number);
- turns the project row into a tombstone (`Erased project`, `erased-<id>` slug, no origins or settings, `erased_at` set);
- audits `project.erased` with a count only.

A failed round rolls back and is retried; an erased project returns early, so re-runs are idempotent. Audit rows keep only structural IDs and expire on their one-year schedule. The tombstone keeps their project reference valid and stays unreachable (404). Organization deletion stays disabled until P6.

## Evidence

The [Postgres test](../../apps/server/src/project-erasure.test.ts) seeds more than one batch of entries plus a notification rule, keys, outbox and queued jobs (including a subject erasure with an email payload). It proves the 409 for an active project, 422 for a wrong slug, 403 for admins, bounded rounds, rollback and resume after a forced audit failure, and zero rows in every `project_id` table except the audit log. It also proves no queued job payload for the project, no personal labels in the project's audit, an untouched neighbour project and 404 afterwards. The isolation suite covers the route. Known gap: no module stores objects before M3; the uploads module must prove the object path through `eraseScope`. Additive migration `20261109104341_project_erasure`.
