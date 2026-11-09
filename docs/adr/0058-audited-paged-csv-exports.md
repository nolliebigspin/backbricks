# ADR-0058: Audited paged CSV exports

- **Status:** accepted during execution; D56 awaits maintainer confirmation
- **Date:** 2026-11-09
- **Task:** P2.5c; ADR-0037/0056; I1/I8/I12/I13

## Context

A response body is read after its HTTP handler returns. Capturing a module repository in that body would escape the caller transaction. Keeping one transaction open for a slow download would also retain a database connection. Rate limiting inside that transaction risks reentering the same pool.

## Decision

Management policies may declare a bounded `rateLimit`. The central [registrar](../../apps/server/src/http/api-routes.ts) consumes it after authorization and before opening the domain transaction. Its identity hashes the principal, tenant, operation and optional resource parameter; no personal content enters buckets. CSV export is admin-session-only and allows one request per user/form per minute.

Only declared CSV routes receive `runtime.streamText(prefix, readPage)`. The [host bridge](../../apps/server/src/routes/modules.ts) releases a commit barrier after the initial transaction, then opens a fresh transaction and module frame for each requested page. Callbacks receive the usual own repository and bounded services, without a tenant selector, driver or reusable transaction. The [stream helper](../../packages/core/src/modules/streams.ts) reads one page per pull, respects backpressure/cancellation and propagates failures. Module configuration history adds an equally scoped revision-page reader. Static route segments may contain safe file extensions such as `export.csv`.

The [forms export](../../packages/modules/forms/src/export.ts) commits a content-free `started` audit before any data can be read. The last read page commits a `completed` audit with the actual selected row count. Canceled or failed exports retain the attempt record; failed final audits terminate the stream. Keyset pagination does not promise a cross-transaction database snapshot when entries change concurrently. Audit counts represent rows selected for the export, not a guarantee that the remote client received every byte.

Column keys are the union of current and historical configurations. User fields use `data.<key>` headers so fields called `id`, `status`, etc. cannot collide with metadata columns. Lists and exports share one filter interpretation and date-range validation. The [core encoder](../../packages/core/src/export/csv.ts) applies formula defusing before RFC 4180 quoting; object/array values are JSON strings. The API is an attachment, remains `no-store`, and never exports source metadata or tenant IDs.

## Evidence

[Encoder properties](../../packages/core/src/export/csv.test.ts) round-trip quotes, newlines and Unicode through an independent test parser and verify formula prefixes. [Stream tests](../../packages/core/src/modules/streams.test.ts) verify bounded prefetch, cancellation, EOF and failures. [Real HTTP tests](../../apps/server/src/forms.export.test.ts) cover roles/scopes, historical columns, audit and rate limiting, and export 50,000 Postgres entries incrementally with chunks below 1 MiB and post-GC retained-memory growth below 40 MiB. No new infrastructure, dependency or invariant change.
