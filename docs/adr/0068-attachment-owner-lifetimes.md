# ADR-0068: Synchronize attachment owner lifetimes

Status: accepted during P3.5b execution; maintainer review deferred to M3 completion.

The initial claim's owner expiry cannot represent later retention or spam edits. An attachment must never outlive its current owner, and all Forms deletion paths must preserve durable object cleanup.

Extend the transaction-bound files capability with `syncOwnerExpiry`, taking at most the shared bulk limit of trusted owner IDs and their current expiry. Uploads updates its own rows, preserving an earlier file/zone bound. Forms recomputes its entries, pages bounded owner records in bounded keyset pages, and synchronizes in the same transaction. Single and bulk spam changes use this operation too. When the provider is disabled, historical file fields with nonempty answers prevent owner deletion or expiry edits and roll back the transaction. A module-owned `revisionById` read (including archived instances, with tenant/module checks) supplies these historical definitions without exposing platform repositories; ordinary status/read edits remain usable. Modules never join or query another module's tables.

Retention purge and subject erasure return deleted entry IDs internally so the same `deleteEntryFiles` helper used by single, bulk, delete-all and project erasure records attachment deletion intents before commit. Object deletion remains a separate durable job (ADR-0064).

Host management mutations, project module jobs and platform retention/subject jobs take the scoped project lock before entry, zone and file locks. This matches configuration and project erasure lock order and prevents lock inversion across capability calls and foreign keys. Jobs within one project serialize; different projects remain independent. Each scan is bounded by its existing timeout. Read routes and fresh export frames do not take this write lock.

Physical erasure completion, outstanding PUTs and disabled-provider project erasure remain covered by P3.7. No invariant changes.
