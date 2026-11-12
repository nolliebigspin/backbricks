# ADR-0060: Notification delivery and throttling

- **Status:** accepted during execution; D58 awaits maintainer confirmation
- **Date:** 2026-11-09
- **Task:** P2.6b; ADR-0037/0049/0059; D49; I8/I11/I13/I19

## Context

ADR-0059 queues one ID-only delivery job per matching rule. Delivery must decide per subject whether to mail at all (spam and test entries are skipped), render content only on opt-in, cap mails per rule and hour (D49) and never mail twice on retry. The core knows nothing about module data, and the shared rate limiter commits outside the job transaction: a rolled-back attempt would still count, and it cannot report how many entries a digest must summarize.

## Decision

`ModuleDefinition` gains an optional `notifications.describe(runtime, { eventType, subjectId, instance, includeContent })` hook. It returns `null` to skip, or `{ fields: { label, value }[] }` with plain-text values (empty unless `includeContent`). `defineModule` validates the input and output (at most 50 fields). Modules without the hook never notify. [Forms](../../packages/modules/forms/src/notifications.ts) skips spam and test entries and uses the entry's own config version for labels.

The [delivery worker](../../packages/core/src/notifications/delivery.ts) re-reads the rule, instance, subject and verified members at run time. It skips disabled rules, archived instances and empty recipient lists. Each rule row stores its throttle state (`throttle_window_start`, `throttle_sent`, `throttle_suppressed`), locked and updated in the job transaction by the pure [`throttleDecision`](../../packages/core/src/notifications/throttle.ts). The first `max_per_hour` entries per fixed hour are mailed. Later ones only increment the suppressed count. The first suppression schedules one digest job at the end of the hour (singleton per rule and window). The digest worker takes and resets the count in its transaction and sends one content-free mail per member. Suppressions accumulate until a digest takes them, so none is lost or reported twice.

[Mails](../../packages/core/src/mail/notifications.ts) (en/de; English until members have a language preference) contain the instance name, the event time and a link into the installation's dashboard: `/projects/{id}/{plural}/{key}?entry={id}` for entries, the instance or project for digests. The dashboard (P2.8) must honor this link. Opt-in values are HTML-escaped (I8) and capped at 1,000 characters per value and 8,000 in total, labels included, so any entry fits the 64 KB mail body limit. Rendered messages enter the existing restricted mail channel (ADR-0049) in the same transaction. That channel holds recipient and body only until sent (hard-deleted on success, 24 h expiry). Content-free mail, the default, never puts entry content in any queue. Without SMTP the server passes no mail port, delivery completes as a no-op, and the options route reports `emailAvailable: false` for the dashboard hint.

Job completion, throttle state and mail enqueue share one transaction. A failed attempt therefore rolls back completely and the retry sends exactly once. Dispatch and digest singletons prevent re-enqueueing.

## Evidence

The [Mailpit test](../../apps/server/src/notification-delivery.test.ts) covers a content-free default mail with a link, a forced mail-enqueue failure retried into exactly one mail, no mail for spam, escaped `<script>` with opt-in, 10 mails and one digest for 11 entries in an hour (a repeated digest run sends nothing), and no-op delivery without SMTP. Unit tests cover template escaping, size caps (property test), en/de copy and the throttle invariant (sent + suppressed = entries). No new infrastructure or dependency; additive migration `20261109101500_notification_throttle`.
