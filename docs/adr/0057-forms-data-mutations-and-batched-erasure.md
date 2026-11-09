# ADR-0057: Forms data mutations and batched erasure

- **Status:** accepted during execution; D55 awaits maintainer confirmation
- **Date:** 2026-11-09
- **Task:** P2.5b; I1/I3/I11/I12/I13; ADR-0048/0050/0055

## Decision

The [entry routes](../../packages/modules/forms/src/mutations.ts) accept only workflow status, read state and spam verdict. They lock the scoped entry, derive clock-based timestamps and spam expiry, and write a content-free audit entry in the same transaction. Submitted content cannot be edited. Individual deletion is available to members or `data:delete` keys.

[Bulk routes](../../packages/modules/forms/src/bulk.ts) use the shared core `bulkIdsSchema` and `MAX_BULK_ITEMS` ceiling of 100. The repository locks the full distinct ID set in ID order before any change; a foreign/missing ID fails the whole transaction. Read/status/spam bulk edits require member/`data:write`; bulk deletion requires admin/`data:delete`. Audit contains target IDs, changed field names and counts only.

Delete-all requires an admin session and an exact form-key confirmation. Its audit and Postgres job enqueue commit together. Each job processes at most `MAX_MAINTENANCE_BATCH` rows and atomically enqueues its continuation or writes the final summarized audit. Continuations carry only the instance ID and cumulative count. They can finish after the form is archived; scoped repository predicates still prevent foreign access. A delayed continuation handles temporarily locked remaining rows without a busy loop. Failed batches/audits roll back deletion and progress together.

All erasure paths call the optional `files.deleteByOwner` capability with the caller's exact transaction. Core now types the deletion portion of the already specified `FilesCapability`; claiming/listing and a production provider remain M3. The server interprets `DELETE` with an explicit null body schema as a bodyless operation, retaining central limits and authorization.

## Evidence

[HTTP/worker tests](../../apps/server/src/forms.mutations.test.ts) prove roles/scopes, metadata-only edits, mixed-form ID rejection, bulk bounds, audit rollback for every mutation and 102 entries removed in bounded batches with one final count. A [synthetic file provider](../../apps/server/src/forms.files.test.ts) proves optional cleanup and its side effects roll back with a failed audit. The [manifest cases](../../apps/server/test/isolation/forms-cases.ts) add cookie/key tenant probes for every operation; denied-write snapshots now include form records. No invariant changes or new infrastructure.
