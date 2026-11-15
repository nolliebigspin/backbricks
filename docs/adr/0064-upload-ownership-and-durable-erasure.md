# ADR-0064: Upload ownership and durable object erasure

- **Status:** accepted; maintainer approved the plan and Q17–Q20 on 2026-11-15
- **Date:** 2026-11-15
- **Related:** P3.4–P3.7; ADR-0013/0048/0055/0057/0061; I1/I4/I9/I11/I12/I13

## Context

M2 declares only `files.deleteByOwner`; M3 adds claims and owner reads. SQL rollback cannot undo an S3 deletion. Deleting a row before its object can also lose the only cleanup reference. Finally, a presigned PUT remains usable after complete or an erasure request, so a second upload can recreate staging after a one-time delete. Project erasure currently accepts only a deleted-row count and cannot express waiting for that URL to expire.

## Decision

Core owns one file-reference validator and transaction-first claim/list/delete capability types. The reference binds a file ID to a random token; uploads stores only its SHA-256 hash. Claim validates the entire set under stable row locks, including tenant, zone, token, ready/expiry state, max count and lack of an existing owner. It stores trusted owner/subject identity. Forms persists file IDs rather than bearer references, and every deletion path calls the same optional capability.

Administrative deletion atomically writes a durable deletion marker, audit and ID-only cleanup job. Committed markers immediately disable list/detail/download/claim access. Worker cleanup deletes both opaque keys idempotently, retains the cleanup identity through PUT expiry, removes any late staging object, and only then hard-deletes private metadata. Provider failures leave retryable work. Failed SQL/audit transactions cannot schedule deletion. Scanning never recopies over an existing final copy on retry.

Extend `privacy.eraseScope` with a typed deferred result containing the real erased count and optional future retry time; preserve the existing numeric result through centralized normalization while migrating callers. Project erasure does not finalize a tombstone until all modules have no remaining objects or pending upload URLs. Continuations respect the retry time instead of spinning. Subject erasure remains asynchronous and distinguishes accepted deletion from pending physical cleanup.

Retain staging keys/intent expiry on ready and terminal metadata until late-PUT cleanup is safe, even for claimed files. Records in deletion remain bounded and discoverable through worker-only repository operations, never management/public reads. Cleanup failures must surface operationally and remain retryable rather than expiring the last object reference.

## Consequences and alternatives

- Object deletion is durable and retryable; it is not falsely described as rollback-capable.
- Removes the M2 retention/subject-delete attachment gap before enabling production file fields.
- Project erasure may wait up to the outstanding PUT expiry plus cleanup time, with immediate access revocation.
- Synchronous object deletion inside administrative transactions, deleting rows first, and forgetting staging after COPY are rejected because they lose audit/rollback safety or leak late objects.
- No invariant changes, storage naming changes, new infrastructure or cross-module repository access.
