# ADR-0074: Erasure purges active payloads and fences waiting workers

Status: accepted during P3.7c execution on 2026-11-16; maintainer review deferred to M3 completion.

Two real Postgres regressions exposed completion gaps. The queue purge excluded every active job, leaving an active child email payload after erasure. Separately, maintenance and module workers could bootstrap before erasure, wait on the project lock, and create activity after tombstoning.

The queue adapter now binds the exact running job name/ID to its transaction with an ephemeral WeakMap. Project finalization deletes every other project payload, including active jobs and notification delivery payloads. The current erasure job survives so its completion commits with finalization; the binding is removed in `finally`. Direct worker invocations have no running queue job to preserve. No persistent workflow state is added.

Module and retention workers recheck `erased_at` after acquiring the project lock. The initial tenant bootstrap remains necessary, and the post-lock check fences workers that were already waiting. Project maintenance already had this check. Archived maintenance gains no erasure authority.

A real queue worker test proves active child removal and exact-current atomic completion. A controlled module callback and actual Postgres lock waiters prove both stale module and retention jobs do no work after erasure. The object-backed acceptance creates 105 ready files through the real HTTP/storage/copy/inspection flow plus an in-flight short-lived upload session. It proves bounded rounds, audit/enqueue rollback, provider outage/recovery, post-expiry abort, final-audit rollback, every tenant-table/job-payload removal, absent object keys and an unchanged neighbouring object's bytes. The provider control separately proves a body can finish after signature expiry when its session was not aborted.

This completes ADR-0064's physical-erasure acceptance and closes ADR-0061's pre-uploads object gap. No dependency, infrastructure or invariant changes.
