# Module plan: Forms

- **Status:** approved (`docs/MODULES.md` rule 4).
- **Approval:** the maintainer approved the plan, including open points A–F in §12, on 2026-11-09 ("Approve all").
- **Milestone / tasks:** M2 · `v0.1.0`; P2.0a–P2.10b in [`PLAN.md`](../../PLAN.md#phase-p2--forms-m2--v010--planned-2026-11-09).
- **Decisions reflected:** DEV-12/Q12 (table seam), Q13 (no-JS posts, redirects), Q14 (recipients), Q15 (erasure gate), Q16 (scope), D44–D50 (planning decisions awaiting confirmation).
- **Lifecycle of this doc:** it is the spec until code lands. Each section is replaced by a link to its code when the task that implements it is done (golden rule 3).

Forms is a headless form backend: a website posts entries (JSON or a plain HTML form), the owner reads them in the dashboard Inbox, exports them, and gets notified. Nothing here needs object storage; forms-only runs as app + Postgres (§C.7).

**Out of scope for M2:** conditional/logic rules, multi-step forms, custom regex (I10), external notification recipients, webhooks, test-entry creation (`test:write`, P5.4, D47), `file` fields in practice (they need the uploads module, M3).

## 1. Ownership (DEV-12)

| Piece | Lives in |
|---|---|
| Config schema, defaults, templates, change classifier, codegen, validator, routes, jobs, retention/privacy handlers, **repository interface** (augments `ModuleRepositories`) | `packages/modules/forms/src/` |
| Drizzle table, migration, repository implementation | `packages/db/src/schema/forms.ts`, `packages/db/src/repositories/forms.ts`, central migration history |
| Catalog entry and composition (the typecheck there proves db's implementation matches the module interface) | `apps/server/src/modules.ts`, `apps/server/src/services.ts` |
| Dashboard pages | `apps/web/src/modules/forms/`; shared components in `packages/ui` |
| `forms.submit` | `packages/sdk/src/forms.ts` (MIT, contract types only, I18) |

Repositories stay thin: they store and query already-validated values. Validation, normalization and search-text extraction stay in the module. P2.3a records the seam in ADR-0055.

## 2. Configuration

One form = one module instance (generic CRUD, revisions, config-as-code and JSON Schema export come from the core, ADR-0040–0043). Instance keys follow `instanceKeySchema` (`[a-z0-9][a-z0-9-]*`, ≤ 63).

### 2.1 Form-level settings

| Setting | Type / bounds | Default |
|---|---|---|
| `fields` | ordered list, 1–50 | template-specific |
| `listFields` | up to 5 field keys shown in the entries list | first two non-hidden fields |
| `spam.honeypotField` | field name `[A-Za-z_][A-Za-z0-9_]*`, ≤ 64, must not collide with a field key | `_gotcha` |
| `spam.proofOfWork` | boolean | `true` |
| `limits.perMinute` / `limits.perHour` | per IP and form, 1–1000 / 1–10000 | 10 / 100; **5**/min when `proofOfWork` is `false` and no explicit value is set (Q13) |
| `redirects.success` / `redirects.error` | absolute `https` URL (or `http` on `localhost`), no credentials, ≤ 2048; `error` only with `success` | unset |
| `retentionDays` | integer 7–3650, or `null` = unlimited | 180 (§E.5) |

`publicWritePolicy(config)` maps these to the core policy (ADR-0046): `proofOfWork`, `honeypotField`, `bodyLimitBytes` = 64 KB (§D.5), `perMinute`, `perHour`.

**Redirect targets (Q13):** a URL's origin must be in the project's allowed origins, and the list must be non-empty. The config schema is pure and can't see the project, so the authoritative check runs on every submit against the *current* origins (origins can change after the form is saved). A target that doesn't match is ignored and the escaped HTML page is shown instead. The dashboard and the config plan show a warning while a redirect doesn't match. See open point C.

### 2.2 Fields

Every field has `key` (`[a-z][a-z0-9_]*`, ≤ 64, unique, stable: it is API surface and a CSV column), `type`, `label` (plain text, 1–200, in the owner's language), optional `help` (≤ 500) and `required` (default `false`).

| Type | Extra rules (all optional unless noted) | Stored value |
|---|---|---|
| `text` | `minLength`/`maxLength` (≤ 1000, default 500) | trimmed string |
| `textarea` | `minLength`/`maxLength` (≤ 10000, default 5000) | trimmed string, newlines kept |
| `email` | `identifiesSubject` (at most one field per form) | trimmed, lowercased string, ≤ 320, core email validator |
| `phone` | – | trimmed string, fixed core validator (digits, spaces, `+ - ( ) /`, 5–32 chars) |
| `number` | `min`/`max` | finite number |
| `url` | `maxLength` (≤ 2048) | `http`/`https` URL |
| `select` | `options` (**required**, 1–100) | one option value |
| `multiselect` | `options` (**required**, 1–100), `min`/`max` = number of selected options | array of option values, deduplicated, in option order |
| `checkbox` | – (`required` means it must be checked) | boolean |
| `date` | `min`/`max` as `YYYY-MM-DD` | `YYYY-MM-DD` string |
| `hidden` | `maxLength` (≤ 500, default 500) | trimmed string (set by the website, e.g. a page name) |
| `consent` | `text` (**required**, ≤ 2000), `version` (**required**, ≤ 64); always required | `{ accepted: true, version, acceptedAt }` (clock time) |
| `file` | `zone` (**required**, upload zone key), `maxFiles` (1–10) | claimed file refs via the `files` capability |

Options are `{ value: [a-z0-9_-]{1,64}, label: 1–200 }` with unique values. A rule that doesn't apply to the type (e.g. `options` on `text`) or `min > max` fails with a field path. `file` fields are rejected with `capability_unavailable` (new catalog code, P2.1a) while the `files` capability is absent, which is always the case in M2. Total config size ≤ 64 KB. All bounds live in `packages/modules/forms/src/constants.ts`.

**Subject identification:** only the email field marked `identifiesSubject` fills `subject_email`. Templates mark it. A form with email fields but none marked gets a plan warning ("entries can't be found by email for privacy requests").

### 2.3 Templates, changes, versions, codegen (P2.1b)

- **Templates** (en and de): contact, quote request, event sign-up, job application. The job application's CV `file` field is included only when the `files` capability is present.
- **`validateConfigChange`:** destructive = removing a field, changing its type, removing a select option, changing a field key. Not destructive = labels/help, adding an optional field, reordering, `listFields`, limits, redirects. Warning only = tightening a rule (new `required`, smaller `maxLength`, narrower `min`/`max`), shortening `retentionDays` (also recomputes expiry, §7), switching PoW off, setting retention to unlimited. Anything unclassified is destructive.
- **`migrateConfig`:** module version 1, identity.
- **`codegen`:** emits a `BackbricksSchema` augmentation so `forms.submit('<key>', data)` is typed (§D.7).

## 3. Data: `form_submissions` (P2.3b)

Columns follow §B.3 with ADR-0023 integrity: composite live-parent FKs to project and instance, core-derived Postgres enums, clock-supplied timestamps. §B.3's SQL is replaced by a link when the table lands.

| Column | Content | Personal? | Lifecycle (ADR-0022 category) |
|---|---|---|---|
| `id` (`sub_`), `organization_id`, `project_id`, `instance_id`, `config_version` | identity, version validated against | no | with the row |
| `data` | normalized field values, incl. consent version/time | **yes** | domain personal record: `expires_at`, purge, subject erasure, project erasure |
| `subject_email` | normalized value of the `identifiesSubject` field | **yes** | same |
| `source` | `{ origin, path, uaFamily, ipHash }`: path without query/fragment, UA as a fixed family enum, daily-rotating IP HMAC (ADR-0025). No raw IP or UA | pseudonymous | same |
| `search_vector` | `simple` tsvector over text-like field values only (D45), never `source` or consent metadata | derived | same |
| `status` (`open`/`done`), `read_at`, `spam_verdict` (`clean`/`suspect`/`spam`, D44), `spam_reasons`, `is_test` | workflow state | no | with the row |
| `created_at`, `updated_at`, `expires_at` | `expires_at` required unless retention is unlimited; `> created_at` | no | – |

**Spam expiry:** when an entry's verdict is `spam` (on insert or by PATCH), `expires_at = least(retention expiry, verdict time + 30 days)` (§F.4). Marking it "not spam" restores the retention expiry. Purging then stays one indexed query.

**Indexes:** keyset list per form `(organization_id, project_id, instance_id, created_at desc, id desc)`; GIN on `search_vector`; partial `(project_id, subject_email)`; partial `expires_at`. A test checks the list/search/subject/expiry queries with `EXPLAIN`.

**Repository interface** (module-owned): `insert`, `list` (keyset + filters + search, page ≤ 100), `get`, `patch`, `delete`, `bulkPatch`/`bulkDelete` (≤ 100 IDs, all-or-nothing), `deleteBatchForInstance`, `counts`, `purgeExpired(now, limit)`, `recomputeExpiry(instanceId, retentionDays, now)`, `findBySubject`/`deleteBySubject`, `eraseBatch(limit)`. Every query is scoped (I1); a project-A handle never sees project-B rows.

## 4. Public API (P2.4a/b)

Paths are under `/v1/public/forms`. The publishable key comes as `Authorization: Bearer` or as the `key` query parameter (needed by HTML forms and preflight); secret keys only in the header. Missing, archived or disabled forms return `404` (I2); a disabled module returns `module_not_enabled`.

| Route | Access | Credentials | Body limit | Rate limits | Response allowlist (I5) |
|---|---|---|---|---|---|
| `GET /{key}` | public read | publishable | – | light per-IP read limit, 60/min (D48; the guard's read branch gains buckets) | `{ key, fields: [{ key, type, label, help?, required, minLength?, maxLength?, min?, max?, options?, consent? { text, version } }], proofOfWork, honeypotField }`. Never retention, redirects, `listFields`, `identifiesSubject` or anything else. `Cache-Control: public, max-age=60`, `Vary: Origin` |
| `POST /{key}/submissions` (JSON) | public write, `secretScope: forms:submit`, idempotency, `quota: forms.submissions` | publishable (PoW per config) or secret key with `forms:submit` (skips PoW, §A.4); secret key with a foreign `Origin` → `403 secret_key_exposed` | 64 KB | per IP+form per config, project 600/min, global (ADR-0046 order) | `200 { id }`. Honeypot hit: the guard's fixed `200 { accepted: true }`, nothing stored (open point A). Never echoes submitted data |
| `POST /{key}/submissions` (urlencoded) | same route, explicit transport opt-in in the core route contract (no other public route accepts form posts) | publishable via `?key=` | 64 KB | same | `303` to `redirects.success`; honeypot also `303` to success. Errors: `303` to `redirects.error?error=<code>&fields=<paths>` (never values), otherwise a minimal escaped HTML page (`Content-Security-Policy: default-src 'none'`, no scripts, back link) |

**Pipeline** (shared guard, ADR-0046): credential → origin → body limit → rate buckets narrowest first → honeypot → proof → strict validation → spam verdict → then one transaction with project lock, rechecks, idempotency (ADR-0047), quota, insert, `files.claim` (when present), event, usage.

**Transports:** JSON uses `{ data, proof?, honeypot? }`. urlencoded maps flat fields to `data`; reserved names are the honeypot field and `altcha` (proof, for sites using the ALTCHA widget); repeated names become `multiselect` arrays; strings are coerced per field type (P2.2). Both transports produce the same normalized data. Plain forms send no `Idempotency-Key`; double submits are bounded by PoW single use and rate limits (documented). A urlencoded post to a form without `redirects.success` gets the HTML error page explaining that the form isn't set up for plain HTML posts (Q13: success redirect required).

**Errors:** RFC 9457. `validation_failed` (422) carries `errors[]` with `path`, `code`, `message`, `meta` and a hint to `GET /v1/public/forms/{key}`. Field codes (one list in core, P2.2): `required`, `unknown_field`, `invalid_type`, `too_short`, `too_long`, `too_small`, `too_large`, `invalid_email`, `invalid_url`, `invalid_phone`, `invalid_date`, `invalid_option`, `too_few_options`, `too_many_options`, `must_accept`. Others from the existing catalog: `proof_invalid`, `payload_too_large`, `unsupported_media_type`, `rate_limited`, `quota_exceeded`, `conflict` (changed body for a used `Idempotency-Key`), `forbidden` (origin).

## 5. Management API (P2.5a–c)

Paths are under `/v1/projects/{projectId}/forms`. Every route declares session role and/or key scope, body limit and an isolation case (I3); the isolation suite probes each with cookies and, where a key scope exists, with a project-A key (P2.0b). Responses are `no-store`. Foreign IDs → `404`.

| Route | Session | Secret key | Body | Response |
|---|---|---|---|---|
| Instance CRUD, revisions, rollback (generic: `GET/POST /`, `GET/PATCH/DELETE /{key}`, …) | as ADR-0040 | `config:read`/`config:write`/`config:destructive` | existing | existing |
| `GET /{key}/summary` | member | `stats:read` | – | `{ total, unread, spam }` (Inbox counts; no personal data). Open point D |
| `GET /{key}/submissions` | member | `data:read` | – | `{ data, nextCursor }`; filters `status`, `read`, `folder=inbox\|spam`, `test`, `from`/`to`, `q` (`websearch_to_tsquery`); `limit` ≤ 100. Items: `id`, timestamps, status, `read`, verdict, `isTest`, values of `listFields` only |
| `GET /{key}/submissions/{id}` | member | `data:read` | – | all values, rendered with the field definitions of the stored `config_version` (revision read); keys no longer in that version under `additionalData` (§B.5). Reading does not mark as read |
| `PATCH /{key}/submissions/{id}` | member | `data:write` | 4 KB | JSON Merge Patch on `status`, `read`, `spamVerdict` only |
| `DELETE /{key}/submissions/{id}` | member | `data:delete` | – | `204` |
| `POST /{key}/submissions/bulk` | member | `data:write` | 8 KB | `{ ids ≤ 100, action: read\|unread\|done\|open\|spam\|not_spam }`, all-or-nothing |
| `POST /{key}/submissions/bulk-delete` | owner/admin | `data:delete` | 8 KB | `{ ids ≤ 100 }`, all-or-nothing. Open point B |
| `POST /{key}/submissions/delete-all` | owner/admin | – | 1 KB | `{ confirm: "<form key>" }` → `202`; a job deletes in bounded batches (Q15: clear entries before archiving). Open point E |
| `GET /{key}/export.csv` | owner/admin | – (D46) | – | streamed CSV, same filters as the list, union of fields across all versions; rate limited (1/min per user and form) |

**Audit** (same transaction, structural only, never content, I12; names in the module's event list): `forms.submission.updated` (IDs, changed field names), `forms.submission.deleted`, `forms.submissions.bulk_updated` / `bulk_deleted` (count), `forms.submissions.delete_all_requested` and one summarized `forms.submissions.deleted_all` (count) from the job, `forms.submissions.exported` (row count, filter names). Deletes call `files.deleteByOwner` when the capability is present.

**CSV** (P2.5c): a generic pure encoder in `packages/core/src/export/csv.ts` (RFC 4180, prefix `'` before `= + - @ \t \r`, §F.1), reused by uploads/reviews. Column logic stays in forms. Columns: `id`, `created_at`, `status`, `read`, `spam`, then field keys.

## 6. Events, metrics, scopes

- **Event** `forms.submission.created`: `{ instanceId, submissionId, configVersion, spam, isTest }`. IDs and flags only; the outbox keeps it 30 days (ADR-0049).
- **Usage metric** `forms.submissions` (counter, count): incremented in the submit transaction; the public route's quota uses it.
- **Scopes:** `forms:submit` (already in the catalog). Data access uses the core `data:*` scopes (D46).

**Notifications** (platform feature, P2.6a/b; forms only provides the event): rules on `forms.submission.created`, optionally bound to one form. Recipients are verified organization members (Q14); delivery skips `spam` and test entries. Mail is content-free by default (form name, time, link); `include_content` is owner/admin only, audited, warned about, HTML-escaped and size-capped (I8). Throttle: 10 mails per rule per hour, then one hourly content-free digest (D49). Job payloads carry IDs; content is read at send time. Open point F covers how recipients are stored.

## 7. Jobs, retention, privacy

| Hook / job | Behavior | Task |
|---|---|---|
| `retention.purgeExpired` | called by the platform `core.retention.purge` fan-out (hourly, ADR-0050), bounded batches of 100, `SKIP LOCKED`; archived forms keep purging; one summarized audit entry per run (counts) | P2.7a |
| `retention.recomputeExpiry` | in the config transaction when `retentionDays` changes (ADR-0040); respects the spam cap | P2.7a |
| `privacy.exportSubject` | entries whose `subject_email` matches, within the project, as JSON | P2.7b |
| `privacy.deleteSubject` | hard-deletes them (plus `files.deleteByOwner`); called by `core.privacy.erase` | P2.7b |
| `privacy.eraseScope` (new hook, ADR in P2.7c) | erases all of the project's entries in bounded, resumable batches | P2.7c |
| `forms.submissions.delete-all` job | deletes one form's entries in batches, writes the summary audit entry | P2.5b |

Routes for subject export/erasure and project erasure are generic platform routes (P2.7b/c), not forms routes.

**Where personal data from a submission can end up, and for how long:**

| Place | What | Bound |
|---|---|---|
| `form_submissions` | everything in §3 | retention (default 180 days), spam 30 days, erasure |
| Idempotency cache | `{ id }` only | 1 day (ADR-0047) |
| Outbox / audit | IDs, counts, field *names* | 30 days / 1 year |
| Notification jobs | IDs only | job retention (ADR-0048/0050) |
| Notification email | nothing by default; values only with `include_content` | leaves the system; owner opt-in, audited |
| Subject erasure job | the subject email | bounded job retention (ADR-0050) |
| CSV export | entries | leaves the system; owner/admin only, audited |
| Logs | nothing (no values, no subject emails) | – |

## 8. Dashboard (P2.8a–c)

Registered through `apps/web/src/modules/registry.ts`; no Inbox nav when forms is disabled. All copy en/de, non-technical ("Inbox", "Entries", "Embed").

- **Inbox:** form list with total/unread counts, empty state with embed hint, create from template.
- **Entries:** `DataTable` (server pagination, filters, search, multi-select, bulk actions, type-to-confirm bulk delete), `RecordDrawer` with `FieldValue` (plain text for every type, I8), "Additional data", mark read on open, spam folder, test badge, CSV download (owner/admin), mobile layout.
- **Fields:** `FieldListEditor` (type picker, per-type rules, up/down, no drag-and-drop), destructive-change preview before saving.
- **Settings:** spam/PoW ("less protected" badge when off), honeypot, `RetentionPicker`, redirects with origin mismatch warning, notification rules (verified members), "delete all entries" before archiving.
- **Embed:** HTML (no-JS, `proofOfWork: false`), fetch and SDK snippets with the project's publishable key and form key, from one snippet module shared with `examples/html`.

Members see entries and may set status/delete single entries; settings are read-only for them (§E.4). Config writes send the current config version and explain stale/destructive conflicts in plain language.

## 9. SDK (P2.9a)

`createClient({ publishableKey | secretKey, baseUrl })` and `forms.submit(key, data, { idempotencyKey? })`: fetches a challenge and solves PoW (WebCrypto SHA-256, ALTCHA v2) when the public schema says so, returns `{ id }`, throws `BackbricksError` (`code`, `fieldErrors`, `requestId`). Dependency-free root entry; browsers, Node ≥ 20, Bun. Not published before M5 (Q2).

## 10. Tests

- **Unit / property (fast-check):** config bounds and invalid combinations with paths; generated configs round-trip; change classifier table (every field change kind); validator per type (accept/reject), both transports normalize identically, no input crashes it; CSV encoder (defusing, quotes/newlines/Unicode round-trip); redirect validation (foreign host, `javascript:`, credentials, protocol-relative); codegen fixture typechecks with TS 7.
- **Real Postgres:** constraints (cross-tenant parents, enums, expiry), scoping, `EXPLAIN` for indexes, purge with an injected clock (expired, spam 30 days, nothing else; two workers), recompute on retention change, subject export/delete, resumable erasure.
- **Real HTTP:** public schema and submit snapshots prove no private fields (I5, manifest-driven gate from P2.0b); idempotent replay and `409`; forced event/usage/audit failure leaves no row; honeypot; PoW; secret key skip and foreign-origin `403`; urlencoded `303` and error page escaping/CSP; isolation for every management route with cookies and keys; role/scope matrix; bulk with one foreign ID changes nothing; 50k-row export stays memory-bounded; `BACKBRICKS_MODULES=forms` boots app + Postgres; disabled → `module_not_enabled`.
- **Mailpit:** content-free notification, escaped `include_content`, digest after 10, no duplicates on retry.
- **Components:** entries table/drawer render `<img onerror>` as text; organization switch cancels queries; i18n key parity.
- **Playwright (P2.9b):** no-JS form and SDK fetch create entries visible in the Inbox; honeypot drop; validation errors; CSV defused; notification in Mailpit; en/de.

## 11. Docs to update as code lands

ARCHITECTURE §B.3 (SQL → schema link), §B.5/§C.3/§C.5 wording (ADR-0055), §D.2 (`bulk-delete`, `summary`, `delete-all` if approved), §D.5 (urlencoded transport, read limits; ADR-0046 update), §F.4 (project erasure; P2.7c ADR); `docs/MODULES.md` link; README quickstart; this doc's sections → code links.

## 12. Decisions approved with this plan

Small decisions this plan makes beyond the accepted answers. All recommendations below were approved with the doc on 2026-11-09.

- **A. Honeypot response differs from success.** The guard answers a honeypot hit with `200 { accepted: true }`, a real submit with `200 { id }`, so a bot that reads responses can tell. *Recommendation:* accept for M2; the honeypot targets untargeted bots, and targeted ones face PoW and rate limits. HTML posts are indistinguishable (both `303` to success).
- **B. Split bulk delete into its own route.** One route policy has one session role, but bulk status changes are member rights and bulk delete is owner/admin (§E.4). *Recommendation:* `POST …/submissions/bulk` (status) plus `POST …/submissions/bulk-delete`, matching uploads' `files/bulk-delete` in §D.2. Additive.
- **C. Redirect origin check at submit time.** Enforcing "non-empty allowed origins" when the form is saved would need the generic instance service to pass project origins into module validation (core change). *Recommendation:* enforce on every submit against current origins (authoritative, also covers later origin changes) and warn in the plan and dashboard.
- **D. Counts route.** The Inbox needs total/unread counts per form. *Recommendation:* `GET …/forms/{key}/summary` (member / `stats:read`), not counting in the browser.
- **E. Delete all as a job.** A form can hold many entries; one request transaction shouldn't delete them all. *Recommendation:* `202` plus a bounded batch job, with a request audit entry and one summary entry at the end.
- **F. Notification recipients as member IDs (P2.6a).** The existing `notification_rules.recipients` column holds addresses. Storing member user IDs and resolving the verified address at send time means no copied email in rules, and removing a member is a simple update in the removal transaction (Q14, ADR-0022). *Recommendation:* store user IDs; P2.6a adds the migration (no rules exist yet).
