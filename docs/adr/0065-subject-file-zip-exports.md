# ADR-0065: Authorized streaming ZIP exports for subject files

- **Status:** accepted; maintainer approved the plan and Q17–Q20 on 2026-11-15
- **Date:** 2026-11-15
- **Related:** P3.7b; ARCHITECTURE §F.4; ADR-0058; I1/I5/I8/I9/I11/I12/I19

## Context

The architecture requires files in subject exports from M3. The existing privacy hooks return JSON only, and the module streaming port supports CSV text only. Putting presigned URLs in JSON is not a complete portable export, and collecting up to 100 MB per file in memory is not acceptable. Forms-only deployments must not acquire a storage dependency.

## Decision

Keep the current JSON export and add an explicit ZIP export option to the same authorized subject-export flow. Add an optional module-owned attachment-export hook and a bounded binary response port, following ADR-0058's commit barrier and fresh scoped page frames. Audit the export attempt before reading private bytes; audit completion with counts. Cancellation/failure closes the source and releases page resources.

The host assembles a streamed ZIP containing the JSON manifest and ready-file contents. Archive paths use generated file IDs, never untrusted names or path segments; original names belong in the authorized manifest. Quarantined, rejected, deleted or unavailable objects receive explicit manifest entries rather than silently disappearing. Quarantined bytes are never exported. Backpressure keeps memory bounded independently of archive size; pagination and any export ceiling must be explicit with a continuation or a clear failure, never silent truncation.

Only a module with its declared storage service yields attachment streams. Forms-only JSON/ZIP metadata exports continue without object storage. The binary port is available only to declared binary-export routes, with the existing admin-session policy and rate limit. No temporary public archive or unbounded derived storage object is created.

## Consequences and alternatives

- Extends the existing audited streaming design rather than adding a second authorization/export stack.
- Requires meaningful tests for ZIP validity/content, safe paths, cancellation, failure, tenant isolation, concurrent deletion and bounded memory.
- Presigned-link manifests and buffering whole files are rejected as substitutes for the required archive.
- No new infrastructure or invariant changes. Any additional archive dependency must be researched, pinned and justified before use; prefer a small streaming STORE writer if it can meet the format/size requirements without duplicating an installed utility.
