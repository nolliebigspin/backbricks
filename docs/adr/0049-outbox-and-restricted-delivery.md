# ADR-0049: Outbox dispatch and restricted delivery

- Status: Accepted
- Date: 2026-11-06
- Task: P1.10b

## Decision

The [core dispatcher](../../packages/core/src/jobs/outbox.ts) claims scoped, unexpired pending events with the existing repository's `FOR UPDATE SKIP LOCKED`. Consumer enqueue and the dispatched marker share that same physical transaction. Consumers have stable registered job names and tenant/event-bound deterministic queue IDs. Retrying dispatch after an uncertain acknowledgement does not enqueue another retained consumer job. A failure before enqueue, after enqueue or while writing the marker rolls everything back. Job execution/completion remains atomic (ADR-0048).

Module job specifications may declare `consumes` for their own declared events or platform events. The registry validates this extension once. Consumers receive a shared structural event projection, never auth tokens or arbitrary personal content. Disabled modules contribute neither jobs nor consumers. The [host dispatcher](../../apps/server/src/outbox.ts) pages only organization IDs from the existing auth identity-table exception, then opens `withTenant` for every business/outbox operation. Each minute handles a bounded org/event batch and rotates an in-memory scan cursor; a restart may repeat scans but cannot lose committed events.

Auth mail is now enlisted in the auth transaction through the narrow `AuthPersistence.enqueueMail` port. It uses pg-boss's transaction adapter and a [restricted delivery queue](../../packages/db/src/queue-mail.ts), outside the general outbox. Successful auth requests cannot commit their identity/invitation changes without the delivery intent; a rollback or deferred commit failure sends nothing. The old direct after-commit path remains only for explicitly unqueued compositions/tests; production serve/all always provide durable delivery.

The delivery envelope holds one validated recipient/message and an absolute one-day expiry. Queue retries have bounded backoff; raw SMTP/provider exceptions never enter job output or logs. Success/expiry hard-deletes the payload immediately. Failed/queued payloads are bounded by the absolute expiry and worker housekeeping (P1.10c). External SMTP remains at least once: a process can fail after SMTP acceptance and before deleting the job, so a duplicate message is possible.

Exposed-key notifications retain the existing audited, throttled content-free event. Production authentication does no SMTP work after rejection. Dispatch enlists delivery jobs and the marker together, resolving verified owners/admins through the same transaction. Delivery rechecks current recipient eligibility before SMTP. Missing SMTP leaves the event pending without blocking other event types; enabling SMTP resumes dispatch. Recipient/token jobs are never returned by HTTP/module capabilities.

[Platform job handlers](../../packages/core/src/jobs/platform.ts) bind selected retention/subject-erasure hooks and lazy configuration migration to the same tenant transaction. Migration has an internal system-authority persistence path: it migrates only the stored configuration for the expected version, skips newer/archived instances and writes a system revision, audit, retention effects and outbox atomically. Request routes retain their existing role/scope/destructive checks; no body flag or HTTP bypass selects system authority. Module subject erasure has no HTTP endpoint and does not claim the future full account/object erasure workflow.

## Evidence

Real [parallel dispatcher tests](../../packages/db/src/outbox.test.ts) prove locked claims, stable consumer identity and rollback before/after enqueue/marker failure. [HTTP delivery tests](../../apps/server/src/durable-mail.test.ts) use a real refused SMTP connection, restart the queue against the same database, recover through Mailpit and prove deferred auth commit failure creates no delivery. Invitations/exposure alerts retry with no content/secret leakage. [Platform hook tests](../../apps/server/src/platform-jobs.test.ts) prove scoped system revisions, retention/erasure invocation, no personal audit fields and physical rollback on audit failure. No database mock is used.
