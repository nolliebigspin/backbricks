# ADR-0069: Erasure requires every persisted module

Status: accepted during P3.5b execution; maintainer review deferred to M3 completion.

A deployment can disable uploads after storing files. Finalizing project erasure with only the selected hooks would otherwise discard the last object identity through the module-instance foreign key cascade, leaving private objects untracked.

The project erasure worker inspects all persisted module instances in bounded pages, including archived instances. If a module is disabled, it fails with `capability_unavailable` before deleting anything. Re-enabling the project's modules lets erasure resume. Normal Forms-only operation still requires no storage or scanner.

The files-to-zone foreign key now uses RESTRICT, through a generated forward migration. It is a database backstop against accidental instance removal before physical file cleanup. The project row remains a tombstone rather than being hard-deleted, as before.

ADR-0064's deferred `eraseScope` result is implemented as a compatible numeric result or `{ count, pendingUntil? }`. The host cannot finalize while physical work is pending and schedules a delayed continuation. Uploads retains its keys until both object cleanup and the last issued PUT deadline are confirmed. Each batch and its continuation commit together. No invariant changes.
