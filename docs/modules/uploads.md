# Module plan: Uploads

- **Status:** approved; maintainer approved the plan, ADRs 0063–0065 and Q17–Q20 on 2026-11-15 ("Approved").
- **Prepared:** 2026-11-15, after the signed `v0.1.0` release.
- **Milestone:** M3 · `v0.2.0`; executable tasks in `PLAN.md`, phase P3.
- **Contract proposals:** ADR-0063 (resource routes), ADR-0064 (file ownership and durable erasure), ADR-0065 (subject ZIP export). All three proposals were approved on 2026-11-15; their contract changes land in the tasks below.
- **Lifecycle:** replace specifications below with implementation links as tasks land. Code remains the source of truth after implementation.

Uploads gives websites private, direct-to-storage file uploads, optional malware scanning, and attachments on form entries. It must run alone, alongside forms, or with any other enabled-module subset. Forms-only must continue to need only the app and Postgres.

Out of scope: proxy uploads (P6.3), multipart/resume, transformations/thumbnails, public file hosting, SVG/HTML previews, archives as general uploads, SDK publication (M5), and cloud billing (C1/C2).

## 1. Ownership and reuse

| Piece | Owner / reuse |
|---|---|
| Config, validation, state transitions, repository interface, routes, jobs, capability implementation | `packages/modules/uploads/src/`; existing `defineModule` runtime and transaction-bound services |
| Table, constraints, generated migration, scoped repository implementation | `packages/db`; ADR-0055, tenant columns, composite parent FKs, scoped query/pagination helpers |
| S3 access and signing | Existing `StorageAdapter` and S3 adapter (ADR-0044); no second storage client |
| ClamAV wire protocol | `packages/adapters`, implementing the existing `Scanner` interface; server composes it |
| Shared attachment contract | `packages/core`; transaction-first `FilesCapability`, one file-reference schema (ADR-0064) |
| Runtime/module/repository selection | Existing server composition and module catalog; replace the uploads descriptor with the operational module |
| Dashboard | `apps/web/src/modules/uploads/`; existing registry, generated admin client, `DataTable`, `RecordDrawer`, `ConfirmDialog`, `StatusBadge`, `RetentionPicker` |
| SDK and HTML example | MIT packages; generated contract types only, existing client/error/proof solver |

Use the existing policy catalog, error catalog, audit/events/outbox, notification rules, job registry, bulk-ID ceiling, clocks/IDs, config versions and privacy/retention fan-out. No new infrastructure.

## 2. Zone configuration

One zone is one generic module instance (`upload-zone`, `upload-zones`). P3.1a implements its [strict configuration and availability check](../../packages/modules/uploads/src/config.ts), [single MIME/extension table](../../packages/modules/uploads/src/formats.ts), [declaration schema](../../packages/modules/uploads/src/declaration.ts), [zone-aware validator](../../packages/modules/uploads/src/validation.ts), and [safe filename/state values](../../packages/modules/uploads/src/values.ts). Types derive from those schemas. [Core retention policy](../../packages/core/src/time/retention.ts) is shared by forms and uploads; existing form behavior is preserved.

The [public write policy and warnings](../../packages/modules/uploads/src/config.ts) keep proof-of-work enabled, require an explicit unscanned choice when no scanner is available, and warn about unscanned/unlimited retention. [Config tests](../../packages/modules/uploads/src/config.test.ts) cover boundary values, MIME/extension pairs, honeypot collisions, unsafe paths/Unicode controls and arbitrary JSON declarations.

P3.1b implements [en/de templates and protected defaults](../../packages/modules/uploads/src/templates.ts), [change classification](../../packages/modules/uploads/src/changes.ts) and [SDK type generation](../../packages/modules/uploads/src/codegen.ts). Unscanned variants have separate keys and explicit labels. Tightened acceptance/deletion rules require destructive approval; existing ready files keep their recorded scan result. [Config format version 1](../../packages/modules/uploads/src/constants.ts) has no legacy migration to invent; the core handles current-version parsing and refuses unknown versions. Forms and Uploads share [the declaration envelope](../../packages/core/src/modules/codegen.ts), while each module owns its value type. Generic operational registration remains P3.3b.

## 3. Stored records and states

The implemented [files table](../../packages/db/src/schema/files.ts) and [generated migrations](../../packages/db/migrations/) own the stored fields and constraints. Shared states/size limits live in [core](../../packages/core/src/storage/files.ts); the upload module reexports/derives them rather than copying enums or bounds.

[Real Postgres schema tests](../../packages/db/src/files-schema.test.ts) prove tenant/project/module parent consistency, byte/hash/name/state/expiry constraints, complete owner pairs, deterministic opaque keys and cleanup indexes. A generated forward correction tightens the owner-pair CHECK against SQL NULL semantics; no applied migration was hand-edited.

The table retains both deterministic keys from intent onward, the PUT expiry, scan/copy timestamps, and a durable deletion marker plus cleanup retry fields. Key presence does not imply that storage contains an object. Only a ready, unexpired, undeleted record may become usable; original names/tokens never enter keys, logs or job payloads. The [module-owned repository interface and stored model](../../packages/modules/uploads/src/repository.ts) are implemented by the [scoped persistence adapter](../../packages/db/src/repositories/files.ts) and [maintenance queries](../../packages/db/src/repositories/files-maintenance.ts). The server composition typecheck proves their match. [Real repository tests](../../packages/db/src/repositories/files.test.ts) cover visibility, literal-name search, pagination, atomic transitions, byte aggregates, inactive cleanup and disabled-module selection. HTTP/workflow implementation remains P3.3 onward.

## 4. Public protocol

The host retains authentication bootstrap, origins/CORS, limits, proof replay, request validation and transaction ownership. The upload module sees only its scoped repository and declared services. ADR-0063 fills the current router's resource-namespace/instance-binding gap without an unscoped file lookup.

| Operation | Request / response |
|---|---|
| `POST /v1/public/upload-zones/{key}/files` | Existing `{data, proof}` envelope; data contains bounded `name`, positive `size`, `type` and optional bounded metadata. Returns only `{fileId, uploadUrl, headers, uploadToken, expiresAt}`. Body ≤ 4 KiB. |
| `POST /v1/public/files/{fileId}/complete` | Same envelope with `{uploadToken}`. Token is in the body. The tenant-scoped resolver verifies it and binds the zone; the handler rechecks it under lock. Returns only the caller's `{fileId, fileRef, status}`. |

Intent validates zone/type/size, checks the declared `uploads.bytes` quota, records usage and reserves the row in one project-serialized transaction. Presign lasts 300 seconds and signs exact length/type. Browser transports let the browser supply `Content-Length` for the exact `File`/`Blob`; they must not try to set that forbidden header manually.

`complete` checks staging HEAD size/type before leaving pending, then atomically records uploaded state and enqueues one ID-only scan job. Duplicate completes do not enqueue again or recopy a final object. Repeating a token-authenticated complete returns current state; the SDK uses bounded backoff and a fresh proof for each poll until terminal state or cancellation/timeout. This reuses the guard rather than introducing an unprotected public status endpoint. Intent responses are not stored in the acknowledgement-only idempotency cache, because they contain bearer credentials and signed URLs.

`fileRef` binds the file ID and claim secret using the shared core schema. It never grants downloading or management rights. Unknown, foreign, wrong-token and wrong-zone references fail without revealing another tenant's data. No public response contains a filename, source, owner, storage key, hash or scan signature.

## 5. Copy, inspect and scan

1. Lock the file and verify the allowed transition and current zone.
2. Copy staging to its final opaque key, which has never had a PUT URL. Retries reuse an existing final copy and never overwrite it from staging.
3. HEAD/read the final copy, enforce exact size, detect type using `file-type`, check extension/MIME allowlist again, and compute SHA-256 with bounded memory.
4. Scan that final copy with the injected ClamAV adapter. `SCANNER=none` can produce ready only when the zone explicitly permits it; store/display an explicit not-scanned result.
5. Persist terminal state and metadata-only events in the worker transaction. Infection quarantines the record and deletes its objects; a type/size mismatch rejects it. Scanner/network failures retry; after three attempts reject safely and schedule cleanup.

The ClamAV adapter streams `INSTREAM` chunks with bounded lengths, timeout, backpressure and sanitized errors. It rejects malformed/truncated replies and distinguishes `OK`, `FOUND` and provider failure. Compose `StreamMaxLength` must cover the configured 100 MB ceiling. Tests use real ClamAV for EICAR acceptance, plus a local protocol server for malformed/time-out cases.

Delete staging immediately after a successful copy, and again after the PUT URL expires: a late PUT must not leave a permanent object. Retain cleanup identity until then. Repeated scans, crashes after COPY, audit failures and cleanup failures must be resumable.

## 6. Forms capability and erasure

ADR-0064 extends the existing `FilesCapability` with transaction-first `claim` and `listByOwner`, preserving `deleteByOwner`.

- Claim checks every reference before changing any: exact tenant/project, configured zone, token, ready/unexpired/undeleted state, max count, no duplicate or prior owner. Acquire locks in stable order. The form's owner row, claims, usage and event commit or roll back together.
- Forms persists file IDs/attachment metadata after claim, never the raw claim secret. The normalized subject identity is propagated for privacy erasure. Attachment retention may be shorter than the form entry; the drawer explains an expired attachment.
- List returns safe owner-bound metadata without tokens or storage keys. It does not let forms read upload repositories directly.
- Every forms deletion path participates: single/bulk/delete-all, retention, spam purge, subject erasure and project erasure. In particular, M2's direct `purgeExpired` and `deleteBySubject` paths must return affected IDs and call the capability before M3 is enabled.

Object storage is outside a SQL transaction. Administrative deletes therefore commit a deletion marker, audit and cleanup job together; object deletion happens after that commit. Cleanup removes both keys idempotently and removes private metadata only when deletion is confirmed and a late PUT is no longer possible. Failed cleanup remains discoverable/retryable. No row can disappear while its object becomes untracked.

Project hard erasure must wait for outstanding PUT URLs and object cleanup before declaring completion/tombstoning. ADR-0064 adds a bounded deferred-result form to the existing project erasure hook so the platform can resume at a future time without busy loops or falsely reporting completion. Subject erasure remains an asynchronous request and reports pending object cleanup honestly.

## 7. Management, events, metrics and privacy

| Operation | Policy / behavior |
|---|---|
| Generic zone CRUD | Existing config roles/scopes, destructive plans and optimistic versions |
| `GET …/files`, `GET …/files/{id}` | Member / `data:read`; bounded keyset pages; zone/status/date/name filters; explicit private management projections |
| `POST …/files/{id}/download-url` | Member / `data:read`; ready files only; audited, rate-limited 60-second attachment URL. Explicit preview mode only for detected PNG/JPEG/WebP/GIF, also audited. |
| `DELETE …/files/{id}` | Member / `data:delete`; audited durable deletion request |
| `POST …/files/bulk-delete` | Admin / `data:delete`; existing 100 distinct-ID ceiling; validate/lock the full set before any mutation |
| `GET …/storage-usage` | Member / `stats:read`; current stored/reserved byte counts as precision-safe values; no names or subject data |

All management routes have manifest isolation cases for cookie and key credentials. Public response shapes join the manifest-driven I5 gate. Downloads/previews never become public list/read endpoints.

Events `uploads.file.ready`, `uploads.file.quarantined`, `uploads.file.rejected` carry IDs and structural status flags only. Quarantine notifications reuse member-only notification rules and the existing throttled delivery pipeline; no filename/content by default. Upload count and declared accepted bytes are monthly counters; current storage is a repository aggregate, not a mislabeled cumulative counter or a new cloud billing system.

Hourly bounded cleanup handles pending/unclaimed files after 24 hours, expired records, late staging objects and failed deletions; archived zones keep cleaning up. Retention changes recompute expiry using the shared clock/semantics. Subject JSON export includes authorized metadata; an additive ZIP option includes a manifest and available ready-file contents (ADR-0065). Quarantined/rejected/missing files are explained in the manifest and never silently omitted. Project erasure proves both tenant rows and real Garage objects are gone.

## 8. Dashboard, SDK and example

- Files navigation appears only for operational uploads. Zones have templates, config, retention, scanning warnings and Embed instructions.
- Table/grid shares one server-filtered query and selection state; names are plain text. Show scanning, quarantined/rejected, ready and not-scanned states, storage totals, downloads and confirmed bulk deletion.
- Preview only safe detected image formats through audited short-lived URLs. No SVG/HTML rendering. Forms drawer lists attachments and supports authorized downloads without rendering claim secrets.
- All copy en/de. Member settings stay read-only. Mutations use config versions and explain stale-state errors with the existing patterns.
- `uploads.upload(file, {zone, onProgress, signal})` reuses client errors/auth/proofs, creates intent, PUTs exact bytes, completes and waits for readiness. Browser XHR provides progress; Node/Bun use fetch with coarse progress. Cancel applies during proof, PUT and polling; automatic retries never create a second intent or replay an unsafe PUT.
- Extend the HTML SDK example with a CV upload and form attachment. Keep the original no-JS form example working; direct file uploads need JavaScript until the later proxy feature.

## 9. Verification and release

Unit/property tests cover config pairs/bounds, transitions, token/reference validation, claim sets, safe filenames, expiry and abort/error mapping. Real Postgres tests cover constraints, scoping, locks, audit/enqueue rollback, competing claims, duplicate complete, retention, cleanup retries and erasure.

The [shared storage contract](../../packages/adapters/test/storage-contract.ts) runs against Garage in CI and can target another explicitly configured S3-compatible provider ([instructions](../storage-contracts.md)). The [Chromium contract](../../e2e/storage.spec.ts) exercises real browser CORS and computed Content-Length. Prove signed type/length rejection, COPY/HEAD/read/delete, private access, attachment headers and real browser CORS. Isolate fixture objects by unique prefixes and remove only those objects.

Acceptance must demonstrate:

1. Real EICAR → quarantined, objects removed, content-free notification delivered to Mailpit.
2. Oversized PUT rejected by storage; executable bytes named `.pdf` rejected after detection.
3. Second PUT after complete cannot alter the final scanned file; its late staging object is eventually removed.
4. Foreign/wrong-zone/expired/already-claimed references fail and competing claims have one winner; failed form/audit writes leave no claim.
5. Attachment downloads force `Content-Disposition: attachment`; only safe images can preview; orphans expire after 24 hours.
6. Subject and archived-project erasure remove real objects, including late PUTs, without false completion; ZIP export is complete and authorized.
7. Uploads-only with scanner none, forms-only, and forms+uploads with ClamAV all boot with exactly their required infrastructure.
8. `bun run check`, build, browser journeys, SDK Node 20/Bun/browser checks, OpenAPI drift/additive comparison and image smoke pass without service skips.

Prepare a `0.2.0` changeset/quickstart and `docs/progress/phase-3.md`. Tagging/publishing requires explicit user authorization, as given separately for `v0.1.0`; M3 implementation does not automatically authorize its release.
