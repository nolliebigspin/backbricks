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

P3.1b implements [en/de templates and protected defaults](../../packages/modules/uploads/src/templates.ts), [change classification](../../packages/modules/uploads/src/changes.ts) and [SDK type generation](../../packages/modules/uploads/src/codegen.ts). Unscanned variants have separate keys and explicit labels. Tightened acceptance/deletion rules require destructive approval; existing ready files keep their recorded scan result. [Config format version 1](../../packages/modules/uploads/src/constants.ts) has no legacy migration to invent; the core handles current-version parsing and refuses unknown versions. Forms and Uploads share [the declaration envelope](../../packages/core/src/modules/codegen.ts), while each module owns its value type. [Operational registration](../../packages/modules/uploads/src/module.ts) now composes these pieces; reviews remains a descriptor.

## 3. Stored records and states

The implemented [files table](../../packages/db/src/schema/files.ts) and [generated migrations](../../packages/db/migrations/) own the stored fields and constraints. Shared states/size limits live in [core](../../packages/core/src/storage/files.ts); the upload module reexports/derives them rather than copying enums or bounds.

[Real Postgres schema tests](../../packages/db/src/files-schema.test.ts) prove tenant/project/module parent consistency, byte/hash/name/state/expiry constraints, complete owner pairs, deterministic opaque keys and cleanup indexes. A generated forward correction tightens the owner-pair CHECK against SQL NULL semantics; no applied migration was hand-edited.

The table retains both deterministic keys from intent onward, the PUT expiry, scan/copy timestamps, and a durable deletion marker plus cleanup retry fields. Key presence does not imply that storage contains an object. Only a ready, unexpired, undeleted record may become usable; original names/tokens never enter keys, logs or job payloads. The [module-owned repository interface and stored model](../../packages/modules/uploads/src/repository.ts) are implemented by the [scoped persistence adapter](../../packages/db/src/repositories/files.ts) and [maintenance queries](../../packages/db/src/repositories/files-maintenance.ts). The server composition typecheck proves their match. [Real repository tests](../../packages/db/src/repositories/files.test.ts) cover visibility, literal-name search, pagination, atomic transitions, byte aggregates, inactive cleanup and disabled-module selection. The public protocol and scan workflow below use this same repository contract.

## 4. Public protocol

The host retains authentication bootstrap, origins/CORS, limits, proof replay, request validation and transaction ownership. The upload module sees only its scoped repository and declared services. [Module resource declarations](../../packages/core/src/modules/routes.ts), [registration validation](../../packages/core/src/modules/registrars.ts) and [the HTTP bridge](../../apps/server/src/routes/modules.ts) implement ADR-0063. [Public instance preparation](../../packages/core/src/abuse/guard.ts) uses a database-enforced read-only tenant frame ([ADR-0066](../adr/0066-read-only-public-resource-lookups.md)), and the resolver sees only its own repository and clock. [HTTP tests](../../apps/server/src/abuse-guard.test.ts) prove origin/body/proof/replay/CORS behavior; [database tests](../../packages/db/src/with-tenant.test.ts) prove writes fail in locator frames.

The implemented [public routes and response allowlists](../../packages/modules/uploads/src/public.ts) own the intent/completion schemas. [Shared bearer/reference validation](../../packages/core/src/storage/file-reference.ts) is used by both protocol operations; [token generation/verification](../../packages/modules/uploads/src/tokens.ts) stores only SHA-256 and compares in constant time. The existing `uploads:create` scope authorizes server writes. Raw upload tokens, file references and signed upload URLs are redacted at the diagnostic boundary.

Intent validates the current zone/type/size, checks the `uploads.bytes` quota, records accepted-byte/count counters and reserves the row in the same project-serialized transaction. Presign lasts exactly 300 seconds and signs exact length/type; orphan expiry is always 24 hours. Browser transports let the browser supply `Content-Length` for the exact `File`/`Blob`.

Completion authenticates its token in the read-only zone locator and again under the file lock. It checks pending-intent expiry, current config version and staging HEAD length/type, then atomically records uploaded state and enqueues one ID-only scan job. Repeated completion returns only the caller's file ID, bearer file reference and state; it never recopies bytes or enqueues twice. Intent credentials are never stored in the acknowledgement idempotency cache. No public status endpoint was added.

[Real HTTP/Postgres/Garage tests](../../apps/server/src/uploads.public.test.ts) prove actual PUT, signed headers/TTL, concurrent completion, private final-object absence, token/project isolation, public proof/CORS, stale config, enqueue rollback and exact expiry. Public-response fields are explicitly inventoried and snapshotted. Protected defaults still reject intents with `SCANNER=none`; explicit unscanned templates remain available. [Immutable-copy inspection](../../packages/modules/uploads/src/scan.ts) and durable outcomes now process the queued scan before a file can become ready.

## 5. Copy, inspect and scan

The implemented [scan worker](../../packages/modules/uploads/src/scan.ts) locks the file, reads its current zone, and creates the private final copy only when no final object or committed copy marker exists. A final object left by a rolled-back SQL transaction is reused; a missing object with a committed marker is rejected rather than recopied. Staging is deleted after copy and its identity retained through URL expiry.

[Final-byte inspection](../../packages/modules/uploads/src/inspection.ts) bounds stream length and tokenizer lookahead, detects the real MIME, computes SHA-256 while scanning/draining, and revalidates the zone's type/extension/size policy. Detection and scanning read the same immutable final object independently; there is no `tee` queue whose faster branch can buffer the full file. Infection takes precedence over an unknown type so a raw EICAR declared as PDF is quarantined. Explicit scanner-none produces a recorded `not_scanned` result; required scanning never silently downgrades.

[Office inspection](../../packages/modules/uploads/src/office.ts) requires an actual bounded `[Content_Types].xml` and matching main part from [the format table](../../packages/modules/uploads/src/formats.ts). A ZIP-directory heuristic alone is insufficient. XML namespace parsing rejects DTD/entity/comment spoofing, macro subtypes, VBA entries, duplicate names, unsafe paths and oversized metadata. This is subtype validation, not a claim that arbitrary uploaded documents are safe to execute. All downloads remain private attachments.

The exact server-only dependency pins are file-type 22.3.0 (MIT, Node >=22), @tokenizer/inflate 0.6.0 and strtok3 10.8.0 (MIT, bounded ZIP/tokenizer controls), and saxes 6.0.0 (ISC, namespace-aware XML without DTD processing). Registry versions/licenses and actual types/source were checked on 2026-11-15; file-type's heuristic fallback is why the separate structural check is required. Bun compatibility is proved by the [Office tests](../../packages/modules/uploads/src/office.test.ts) and [real Garage/worker tests](../../apps/server/src/uploads.scan.test.ts); no dependency enters the MIT SDK/CLI or changes their Node 20 floor.

Real tests prove PDF-named executable rejection, all supported image/Office detections, clean/EICAR scanning, explicit unscanned results and SQL-rollback/second-PUT immutability. The S3 adapter now also sanitizes errors that occur after read response headers, with a [disconnected-stream test](../../packages/adapters/src/storage/s3.test.ts). [Terminal outcomes](../../packages/modules/uploads/src/outcomes.ts) commit the state, structural audit/event and ID-only cleanup job together. [Retry continuations](../../packages/modules/uploads/src/scan.ts) persist three attempts, delay retries, and ignore obsolete duplicate deliveries; provider failure can never make a file usable. Audit/event/queue failures remain transaction failures, rather than being misclassified as malware verdicts.

[Cleanup](../../packages/modules/uploads/src/cleanup.ts) runs from committed durable intent, deletes dangerous objects, tracks both physical-cleanup timestamps, and retains keys until old PUT URLs expire. Cleanup failures persist another delayed attempt. A row cannot be removed until both final-object deletion and post-expiry staging cleanup are confirmed. Workers acquire a scoped project key-share lock, then a zone shared lock where needed, then file locks; this aligns with public/config mutations and foreign-key checks. The generated cleanup-state migration adds the final-object confirmation field.

[Real outcome tests](../../apps/server/src/uploads.outcomes.test.ts) prove EICAR quarantine, deletion of both Garage objects and content-free Mailpit delivery through the actual queue/outbox. Duplicate delivery, three provider failures, forced event/audit rollback and policy-edit serialization also pass. [The notification descriptor](../../packages/modules/uploads/src/notifications.ts) never includes names/content/tokens/signatures, even for an include-content rule. The later scheduled pass handles late staging writes and recovery of abandoned worker jobs.

The implemented [ClamAV adapter](../../packages/adapters/src/scanner/clamav.ts) follows the [official NUL-framed INSTREAM protocol](https://docs.clamav.net/manual/Usage/ClamdProtocol.html): bounded 64 KiB writes, a whole-operation timeout, a capped reply and sanitized provider errors. [Protocol tests](../../packages/adapters/src/scanner/clamav.test.ts) cover malformed/truncated/oversized/premature replies, disconnects, input failures, byte limits and cancellation. [Real scanner tests](../../packages/adapters/src/scanner/clamav.integration.test.ts) prove clean/EICAR verdicts and a streamed 100 MiB file. No full-file buffer is constructed.

[Server composition](../../apps/server/src/services.ts) registers PING readiness only when an enabled module selects ClamAV. [Subset readiness tests](../../apps/server/src/scanner-readiness.test.ts) prove scanner-none/forms-only need no daemon and a configured failed daemon makes readiness fail safely. `mise run scan` starts the existing optional compose profile; CI uses that same service definition. Compose sets `StreamMaxLength`/`MaxFileSize` to 100 MiB and `AlertExceedsMax=yes` so scan-limit exhaustion is not silently treated as clean. The pinned image's [environment configuration mechanism](https://github.com/Cisco-Talos/clamav-docker/blob/main/clamav/README-alpine.md) was verified against its actual `/init` and `clamconf` output.

Delete staging immediately after a successful copy, and again after the PUT URL expires: a late PUT must not leave a permanent object. Retain cleanup identity until then. Repeated scans, crashes after COPY, audit failures and cleanup failures must be resumable.

## 6. Forms capability and erasure

[Core attachment/claim/scan schemas](../../packages/core/src/storage/file-metadata.ts) and [the files capability](../../packages/core/src/modules/capabilities.ts) implement ADR-0064's transaction-first claim/list/delete seam. Shared references and retention arithmetic each have one owner; domain size constraints derive from the shared file-size schema.

[The uploads provider](../../packages/modules/uploads/src/capability.ts) serializes claims through the scoped project, locks parent zones before a stable file-ID order, validates every token/zone/current policy/ready state before changing any ownership, and assigns one complete set to one trusted owner. Duplicate references and attempts to append to an existing owner are rejected. Owner identity, normalized subject email and the owner expiry bound are stored together. The generated owner-expiry migration and retention recomputation clamp zone changes to that bound; unclaimed files retain their fixed orphan expiry.

[Forms attachment integration](../../packages/modules/forms/src/attachments.ts) claims the entire submission's files in the same transaction and replaces bearer references with IDs before entry insertion, search, events or export. [The submission validator](../../packages/modules/forms/src/validator.ts) uses the shared reference schema and rejects duplicates. [Authorized entry detail](../../packages/modules/forms/src/admin.ts) borrows owner metadata through the capability and explicitly projects it; no upload repository crosses the module boundary. The public form schema exposes only the configured upload-zone key and max count for file fields.

[Real claim tests](../../apps/server/src/uploads.claims.test.ts) prove foreign/wrong-zone/wrong-token/unready/expired/duplicate/already-owned rejection, current scan-policy tightening, a single concurrent winner, owner-expiry clamping and transaction rollback at owner insert/audit/event/usage. IDs replace secrets in stored answers, metadata never returns keys/tokens, and failed claim diagnostics contain no private filename. Production file fields are enabled only when the selected registry provides files; P3.5b covers every Forms deletion path.

Every Forms deletion path participates: single/bulk/delete-all, retention, spam purge, subject and project erasure. The [lifecycle integration](../../packages/modules/forms/src/lifecycle.ts) closes the earlier direct-purge gap. [Durable deletion requests](../../packages/modules/uploads/src/deletion.ts) already provide the shared transactional marker/audit/enqueue operation for capabilities and management.

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

The implemented [private read routes](../../packages/modules/uploads/src/admin.ts) use [strict response projections and query schemas](../../packages/modules/uploads/src/admin-schemas.ts). `zoneId` filters by the opaque upload-zone instance ID; names use literal case-insensitive substring search, and timestamps are inclusive UTC bounds. Deleted/expired metadata is hidden, including from detail reads. [HTTP/isolation tests](../../apps/server/src/uploads.admin.test.ts) exercise all selected uploads management operations with cookies and scoped keys, literal search, paging and private-field exclusion.

[Current usage](../../packages/db/src/repositories/files.ts) returns decimal strings without numeric coercion. Stored bytes are usable ready final copies. Reserved bytes cover unfinished copies, bytes awaiting cleanup and possible staging writes; an early staging deletion does not release reservation until cleanup is confirmed after PUT expiry. The two totals do not overlap. Reservations are conservative capacity accounting, not a claim that every reserved object physically exists. Monthly accepted-byte counters remain independent. Real database tests cover lifecycle accounting and aggregates above 32-bit range; wire-schema tests preserve values above JavaScript's safe integer range.

[Download and deletion routes](../../packages/modules/uploads/src/mutations.ts) share the [usable-file predicate](../../packages/modules/uploads/src/usability.ts) with claiming. Download URLs last at most 60 seconds and are shortened to the file's own expiry. The handler rechecks after storage I/O and the provider-neutral absolute signing deadline protects the signing step too (ADR-0070). Both the URL response and actual private GET prohibit caching; default byte responses are octet-stream attachments, while explicit previews use only the core detected-image allowlist. Downloads are rate limited and audited as `files.downloaded` before the URL can escape the transaction. Revocation immediately blocks new API access; an already issued URL can remain usable until cleanup deletes its object or its short expiry.

Single and all-or-nothing bulk deletion reuse [durable intent](../../packages/modules/uploads/src/deletion.ts). [Real HTTP/Garage tests](../../apps/server/src/uploads.downloads.test.ts) cover filename headers, exact bytes, preview/expiry rules, scopes, rate/audit counts, audit rollback and delayed-storage deadline races. [Deletion/outage tests](../../apps/server/src/uploads.deletions.test.ts) prove audit/enqueue rollback and cleanup after provider recovery. Every selected management route has cookie/key isolation, including mixed foreign-ID batches.

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

P3.5b connects every Forms deletion path to durable attachment cleanup and synchronizes owner expiry after retention/spam edits through the bounded [capability](../../packages/modules/uploads/src/capability.ts). [Lifecycle tests](../../apps/server/src/uploads.owner-lifecycle.test.ts) use real Postgres/Garage for retention, single/bulk/delete-all/subject/project deletion, physical cleanup and late staging writes. Historical Forms configurations remain readable without uploads; new file-config writes require the provider (ADR-0067). Project erasure uses the approved deferred result and waits for physical cleanup/PUT expiry; disabled persisted modules fail closed before erasure (ADR-0069). Multi-batch/provider-outage erasure acceptance remains P3.7c.

With uploads disabled, historical nonempty file answers prevent Forms owner deletion or lifetime edits until the provider is re-enabled. These operations roll back rather than leave live files attached to missing owners; ordinary reads and status/read edits remain available.
