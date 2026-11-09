# Open questions

Decisions for the maintainer, started in P0 planning (2026-11-04), extended for P1 on 2026-11-06 and for P2 on 2026-11-09. Answer inline under each question. Each lists a recommendation and the latest task by which the answer is needed. Recommendations are not approvals. Execution runs add invariant-preserving implementation decisions under "Decided, please confirm".

## Open

### Q1 – Drizzle 0.45 (stable) or 1.0 (release candidate)?
- **Context:** `drizzle-orm` latest is 0.45.4 / `drizzle-kit` 0.31.11; `1.0.0-rc.5` is out. 1.0 changes the migrations folder format. Switching is free until the first real migration is committed. Better Auth supports both (`drizzle-orm ^0.45.2 || >=1.0.0-rc.1`).
- **Recommendation:** start P0 on 0.45.4. The P0.9a spike also tries 1.0 RC. Move to 1.0 before P1.1 only if it is GA by then or the spike shows the RC is solid; otherwise stay on 0.45 and migrate after 1.0 GA with `drizzle-kit up`.
- **Needed by:** P1.1 (first real migration).
- **Answer (2026-11-05):** Use Drizzle 1.0 RC (`drizzle-orm` / `drizzle-kit` `1.0.0-rc.5`) from the start. Pin exactly and upgrade to 1.0 GA when it ships. The P0.9a spike still verifies it on Bun.

### Q2 – Register the npm names now?
- **Context:** `backbricks` (the CLI package) and the `@backbricks` scope are still free on npm (checked 2026-11-04). They're needed for publishing in M5.
- **Recommendation:** create the npm organization `backbricks` and reserve the `backbricks` package name now, to avoid squatting. 2FA and provenance setup can wait until P5.
- **Needed by:** P5.3 at the latest; ideally now.
- **Answer (2026-11-05):** Not now; the maintainer registers the names later. Stays open with deadline P5.3.

### Q3 – Where do the repository and container images live?
- **Context:** The repo is `nolliebigspin/backbricks` (personal account); the architecture names the image `backbricks/server`. The image location affects `ghcr.io/…` names, `CODEOWNERS`, links in docs, and the Vercel/GitHub integration.
- **Recommendation:** create a GitHub organization `backbricks`, transfer the repo before the first public release, and publish to `ghcr.io/backbricks/server`. P0 only uses the local tag `backbricks/server:dev`.
- **Needed by:** P2.10 (first image release `v0.1.0`).
- **Answer (2026-11-05):** No organization. The repo stays at `nolliebigspin/backbricks`, so images go to the GHCR namespace of that account (`ghcr.io/nolliebigspin/…`, exact image name set in P2.10). P0 still uses only the local tag `backbricks/server:dev`.

### Q4 – Accept the proposed deviations?
- **Context:** `PLAN.md` → "Proposed deviations": DEV-1 (no `packages/tsconfig`), DEV-2 (internal packages as TS source), DEV-3 (`ids` and tenancy types in core), DEV-4 (`/readyz` DB-only in P0), DEV-5 (env lint rules), DEV-7 (no `setup` stub in P0). DEV-6 only applies if the TypeScript 7 decision rule triggers it; DEV-8 is decided when planning P1.
- **Recommendation:** accept all six.
- **Needed by:** start of P0.
- **Answer (2026-11-05):** Accepted: DEV-1, DEV-2, DEV-3, DEV-4, DEV-5, DEV-7.

## P1 planning: open decisions

### Q5 – Accept the earlier admin client and the M1 module test boundary?
- **Context:** DEV-8 avoids hand-written dashboard fetch/types by bringing `sdk/admin` forward from P5.2. DEV-9 reconciles M1's "no domain modules" with registry/instance/subset acceptance. The MIT SDK may import generated API-contract types, but no AGPL runtime code. The declared `/admin` export also needs a specific architecture-rule fixture because the current rule permits only root `index.ts` entries.
- **Recommendation:** Accept DEV-8/DEV-9. Generate the admin client in P1.11b, keep the browser SDK root dependency-free, and test generic module behavior with synthetic definitions that are never mounted in production. Existing domain infrastructure declarations remain the single source until their full definitions land in P2–P4. Metadata distinguishes declared/shipped modules from working APIs; real-domain subset proofs follow each module's milestone. Do not fill the contract with fake production domain schemas.
- **Needed by:** P1.6a (fixture/contract boundary); P1.11b (admin export).
- **Answer (2026-11-06):** The maintainer explicitly approved the Q5 recommendation in the execution session: bring the generated sdk/admin client into M1 and use synthetic modules for registry tests, with domain APIs left to their later milestones.

### Q6 – How should sign-up and missing SMTP work before the M6 setup wizard?
- **Context:** M1 must demonstrate sign-up, while self-host defaults are invite-only and the first-admin setup arrives in P6. SMTP is optional, with a promised copyable invitation fallback, but verification/reset cannot expose bearer tokens through anonymous responses. Current config has no `SIGNUP_POLICY` setting yet.
- **Recommendation:** Add injected `SIGNUP_POLICY=open|invite_only`, default `invite_only`; explicitly select `open` for the M1 dev/E2E environment with Mailpit and document that production bootstrap is not finished until P6. Require verification before open-signup accounts gain platform access. Without SMTP, offer copyable invitations only to authenticated owner/admin sessions, never reset/verification links to anonymous callers. Define invitation acceptance for a new account as a constrained invite-bound signup flow, not general open registration; prove matching identity/token checks. If no verified delivery method exists, reset/verification-dependent actions fail clearly rather than silently disabling verification. Existing authenticated members can continue working without SMTP.
- **Needed by:** P1.8b and P1.1b; permission to keep M1 bootstrap explicitly development-only.
- **Answer (2026-11-06):** The maintainer explicitly approved the Q6 recommendation and implemented auth baseline in the execution session, including invite-only defaults, explicit development open signup with Mailpit, verification, authenticated invitation fallback, no anonymous bearer fallback and M6 production bootstrap.

### Q7 – Is project DELETE an archive or irreversible erasure?
- **Context:** P1.5 specifies soft-deleted projects and §B.1 allows soft deletion of configuration, but §F.4 says project/organization deletion is hard and cascading. Soft deletion must not become indefinite retention of personal records. Raw Better Auth organization deletion is also an exposed route unless explicitly disabled.
- **Recommendation:** Treat project removal in M1 as an explicit archive of configuration, immediately disabling keys/public access, without claiming personal-data erasure. Keep module-instance configuration deletion distinct from personal-record deletion and require destructive permission where it can affect data. Disable organization deletion/ownership-transfer endpoints until their complete audited lifecycle is implemented. Before M2 release, define the separate hard-erasure workflow (DB, objects, jobs and audit retention); record the decision in an ADR and update the affected architecture/API wording together. If the maintainer instead wants DELETE to mean hard erasure in M1, replace P1.5a's archive behavior and re-estimate it before implementation.
- **Needed by:** P1.2b (constraints/cascades), P1.1c/P1.5a (route exposure and semantics).
- **Answer (2026-11-06):** The maintainer explicitly approved the recommended archive behavior in the execution session. M1 removal archives configuration and immediately disables access; personal-data erasure is a separate workflow required before M2. Incomplete erasure paths remain inaccessible, including raw library routes.

### Q8 – Clarify personal-data expiry for platform/auth records?
- **Context:** I11 says every personal-data record has `expires_at`, while generated auth identities/memberships and persistent notification recipients have different lifecycles. §B.3 audit rows have personal `actor_label` but no expiry; notification recipients and cached idempotency responses also need a retention decision. Queued verification/reset/invitation emails can contain recipients and bearer links. Better Auth table exceptions in §B.1 concern tenancy, not an explicit I11 exception.
- **Recommendation:** Omit emails and user-entered key names from audit labels; use opaque actor IDs/key kind/display prefix and keep the stated one-year audit retention with indexed expiry. Actor IDs remain potentially personal, even without a readable label. Give transient idempotency/verification/replay records and completed mail jobs bounded expiry; minimize payloads and purge failed jobs containing tokens at a defined bound. Add `organization_id` to project-scoped idempotency and enforce parent consistency. For active auth identities/memberships and recipient configuration, approve an explicit lifecycle clarification to I11 (retained while needed, hard-deleted on removal/account erasure; expiring sessions/invitations remain bounded), rather than silently inventing an exception or expiring active user accounts. Define each category in the ADR before schema generation. Do not retain bearer secrets in general outbox/audit payloads; use a restricted expiring delivery mechanism.
- **Needed by:** P1.2a/P1.2b; P1.10b/c applies the same decision to queued mail/cleanup.
- **Answer (2026-11-06):** Approved explicitly by the maintainer in the execution session: “Approve the Q8 recommendation.” Update I11 and its architecture/ADR lifecycle categories before schema work. Transient records and audit logs retain bounded expiry; this approval does not permit soft deletion or unbounded token/job retention.

### Q9 – Confirm the M1 management permission matrix?
- **Context:** §D.1 defines project-bound key scopes, but project list/create/delete permissions are not explicit. §D.2 marks keys session-only while §D.8 promises CLI `keys list`; that is a future contract conflict, not a reason to accidentally allow key creation. Integration/usage reads and member/activity data also need explicit policy.
- **Recommendation:** Organization/member/activity management and organization-wide project listing/creation/deletion stay session-only (owner/admin mutations, member reads only where §E.4 allows). Keys can read their bound project's safe integration metadata with `integration:read`, change approved bound-project settings/origins with `project:write`, and access usage aggregates with `stats:read`; no cross-project enumeration or project creation. Keep all key-management endpoints session-only in M1 and leave CLI `keys list` for an explicit scope decision in P5 (do not silently add it to the agent preset). Config reads/plans use `config:read`; writes need `config:write`, and destructive changes additionally need `config:destructive`. Sessions use owner/admin for configuration/key changes, with normal member activity access per the accepted role matrix. API handlers, OpenAPI metadata and tests derive from one policy catalog.
- **Needed by:** P1.3b/P1.4a, before project/key routes.
- **Answer (2026-11-06):** The maintainer explicitly approved the recommended permission matrix in the execution session: session-only organization administration, project listing/creation/removal and key management; project-bound keys only for explicitly scoped project operations.

### Q10 – Clarify the key-authentication bootstrap boundary in I1?
- **Context:** Random key strings contain no tenant selector. ADR-0024 anticipated credential bootstrap, but I1 literally requires a known tenant before every tenant-table read. The prepared implementation's only initial read accepts a SHA-256 hash and returns key/organization/project IDs from an active-key/active-project exact match; no metadata or scopes. Everything thereafter uses `withTenant`. See ADR-0034 and `packages/db/src/repositories/credential-bootstrap.ts`.
- **Recommendation:** Approve the narrow authentication-only hash/ID projection as an explicit I1 clarification. Keep it unavailable to handlers/modules/capabilities, with no general query API or HTTP endpoint. Do not create a duplicated global credential index or silently require new tenant hints in the key protocol.
- **Needed by:** P1.4c completion/commit. AGENTS §1.7 requires explicit invariant-change approval; code and real-service tests are prepared for review.
- **Answer (2026-11-06):** The maintainer explicitly approved the narrow bootstrap clarification in the execution session: “Approve the narrow bootstrap clarification.” Update I1 and its architecture/ADR wording for this sole exact-hash/ID projection; no unscoped metadata or general query access is permitted.

### Q11 – Extend the exact-hash authentication bootstrap to publishable keys?
- **Context:** Public requests carry an opaque publishable credential without a trusted tenant selector. I1/Q10 currently permit the narrow active-secret-key hash/ID bootstrap only. The public challenge/auth tasks need the equivalent lookup for publishable credentials before scoped access can begin.
- **Recommendation:** Extend the same exact SHA-256, active-key/active-project, IDs-only authentication projection to publishable keys. Keep kind selection trusted and separate from HTTP input; all metadata/origin/instance/scope/business access still goes through `withTenant`. No general query API or unscoped HTTP endpoint. Alternative: change the public protocol to require an explicit project-ID header on every request.
- **Needed by:** Public-key challenge/auth composition in P1.9a/b. Provider/replay work does not depend on this answer.
- **Answer (2026-11-06):** The maintainer explicitly approved: “Approve Q11 and finish it (recommended).” Extend the same exact-hash, active-key/project, IDs-only bootstrap to publishable credentials through a trusted kind-specific factory; all later access stays scoped. Implemented in ADR-0054.

## P2 planning: open decisions

### Q12 – Where do module tables and their repositories live?
- **Context:** The first production module table arrives in P2.3. §B.5/§C.5 put Drizzle tables in module packages, but a module imports only core (I13). It then can't reference `module_instances` for the composite live-parent FKs (ADR-0023), nor reuse db's tenant columns and `scope` helper without copying them. DEV-12 in `PLAN.md`.
- **Recommendation:** Accept DEV-12. The module declares its repository interface by augmenting `ModuleRepositories`; `packages/db` owns table, migration and implementation; server composition wires selected modules' factories into `createWithTenant`, and its typecheck proves the implementation matches the module contract. Alternative: module-owned tables, with the FK and scope pieces moved into a new shared package or hand-written SQL (more work, re-estimate P2.3a).
- **Needed by:** P2.3a (critical path).
- **Answer (2026-11-09):** The maintainer accepted the recommendation (“Do all the recommended ones”). DEV-12 is accepted: module tables, migrations and repository implementations live in `packages/db`; the module owns the repository interface. P2.3a writes the ADR and removes the architecture-rule allowance for module `schema` files.

### Q13 – How do plain HTML forms without JavaScript handle proof-of-work and errors?
- **Context:** The M2 exit criterion needs a plain HTML form; PoW is on by default (§E.5) and needs JavaScript. A urlencoded post also needs a success target and some response for validation errors, where a JSON problem document is useless to a visitor.
- **Recommendation:** Keep PoW on by default. A form may set `proofOfWork: false` explicitly; the plan shows a warning, the dashboard marks the form "less protected", and honeypot plus the per-IP limits stay on (default lowered to 5/min for such forms). The no-JS example uses that setting; the fetch/SDK variant keeps PoW. Redirects: `redirects.success` (required for urlencoded posts) and optional `redirects.error`, both checked against the project's allowed origins (a non-empty origin list is required to set them). On error: `303` to the error URL with `?error=<code>&fields=<paths>` (never values); without an error URL, a minimal escaped HTML page (no scripts, `default-src 'none'`) listing the problems with a back link. Alternative: no-JS posts always require PoW via the optional ALTCHA widget script (then the example isn't JavaScript-free).
- **Needed by:** P2.1a (config shape), P2.4b.
- **Answer (2026-11-09):** The maintainer accepted the recommendation (“Do all the recommended ones”). PoW stays on by default with an explicit, warned per-form opt-out (5/min default for such forms); success/error redirects are checked against non-empty allowed origins; errors without an error URL get the minimal escaped HTML page.

### Q14 – Who can receive notification emails?
- **Context:** Notification rules store recipient addresses (table exists since P1). Free-form addresses let any account send mail to third parties through the instance, which matters for open sign-up and the later cloud. `include_content` sends personal data by email.
- **Recommendation:** In M2, recipients are members of the organization with a verified email, picked from a list; removing a member removes them from rules (Q8 lifecycle). External addresses with double opt-in come later on demand. Only owner/admin may create rules or enable `include_content`; enabling it is audited and the dashboard warns about personal data in email.
- **Needed by:** P2.6a.
- **Answer (2026-11-09):** The maintainer accepted the recommendation (“Do all the recommended ones”). Recipients are verified organization members in M2; only owner/admin create rules or enable `include_content`, which is audited.

### Q15 – What exactly must the M2 hard-erasure gate cover?
- **Context:** Q7/ADR-0030 require a personal-data hard-erasure workflow, separate from configuration archive, before the M2 release: DB records, objects, queued jobs and the retained audit lifecycle. Organization deletion is disabled (§F.4).
- **Recommendation:** Project erasure only: owner-only, type-to-confirm, allowed only for an archived project. A worker job calls a new `privacy.eraseScope` module hook (ModuleDefinition change, ADR), deletes in bounded batches including storage objects when present, then removes project-scoped transient rows, keys, rules, instances and revisions. Audit rows keep only structural IDs and expire on their one-year schedule; the project's archived row is kept as a tombstone without personal data so audit references stay valid. Form archive keeps its entries under their retention; the dashboard offers "delete all entries" before archiving. Organization deletion stays disabled until P6.
- **Needed by:** P2.7c (before tagging `v0.1.0`).
- **Answer (2026-11-09):** The maintainer accepted the recommendation (“Do all the recommended ones”). The gate covers archived-project erasure through a new `privacy.eraseScope` hook (ADR); organization deletion stays disabled until P6.

### Q16 – Accept the revised P2 estimate?
- **Context:** The detailed plan is 124 h (≈ 15.5 PD) plus a 25 h reserve, against a 9–11 PD allowance. The extra comes from the erasure gate, generic notification rules and privacy routes, the module table seam, urlencoded transport and the P1 review test gaps.
- **Recommendation:** Accept the detailed estimate as the planning envelope. If the allowance must hold, trim in this order: notification digests (fixed hourly cap only), the destructive-change preview in the Fields editor, notification-rule editing in the dashboard (API only in M2).
- **Needed by:** start of P2 execution.
- **Answer (2026-11-09):** The maintainer accepted the recommendation (“Do all the recommended ones”). The detailed estimate (124 h + 25 h reserve, 149 h envelope) is the P2 planning envelope; no scope trims.

## Decided in planning, please confirm

- **D0 – TypeScript:** stay on TypeScript 7 if it works; TypeScript 6.0.3 is an acceptable fallback (maintainer guidance in the planning session). The decision rule in `PLAN.md` applies: tool-local fallback first, repo-wide TS 6 only as a last resort, recorded in ADR-0020.
- **D1 – Runtime base image:** `oven/bun:1.4.4-slim` (has a shell for debugging and the healthcheck). Distroless is re-evaluated in P6.6.
- **D2 – Keep Bun's isolated linker:** it prevents phantom dependencies, which supports the module boundaries (I13). Compose gets one `node_modules` volume per workspace.
- **D3 – Fixed Garage dev key:** committed in `.env.example`/compose, dev only and clearly marked as such.
- **D4 – Spike code is throwaway:** only ADR-0020 (with commands and results) is committed.
- **D5 – E2E smoke job on every PR:** it's cheap in P0; revisit if it gets slow.
- **D6 – Dev ports:** server 3000, web 5173, Postgres 5432, Garage S3 3900 / admin 3903, Mailpit SMTP 1025 / UI 8025, ClamAV 3310.

### Decided in the P0 execution run, please confirm

Details: `docs/progress/phase-0.md` → "Deviations".

- **D7 – No 405 yet:** unknown method/path combinations return 404 until the API routes exist; P1.11 can derive 405 from the OpenAPI route table.
- **D8 – No `HEALTHCHECK` in the image:** it would apply to every role; compose defines it per service (`serve`: `/healthz`).
- **D9 – Own TypeID encoder** instead of `typeid-js` (small, checked against the spec vectors, uses the injected clock).
- **D10 – Integration tests skip locally when the compose services are down and fail in CI** (`CI=true`), so `bun run check` and pre-push work without Docker, while CI always runs them.
- **D11 – `AppError` takes its HTTP status from the code catalog** (one status per code); AGENTS.md §5 is updated.
- **D12 – JSON logs only** (no `pino-pretty` dependency); pipe through `bunx pino-pretty` locally.

### Agreed for sequential Claude/Codex handoffs (2026-11-06)

- **D13 – One checkout, one active agent:** the maintainer assigns work to either Claude or Codex sequentially. Use the existing checkout and feature branch; separate worktrees and concurrent-agent coordination are unnecessary. Inspect status/diff and the first unticked plan task at handoff; preserve unfinished work and record its tests/next step in the plan's execution notes. This reflects the maintainer's instruction in the planning conversation, not a pending permission request.

### Decided during P1 execution, please confirm

- **D14 – Auth boundary:** P1.1a proved the request-scoped outer transaction and db-owned generated auth schema (ADR-0021). The stock adapter transaction option alone fails the audit rollback control; awaited hooks inside the outer transaction work for organization creation, invitation acceptance and member role updates. This preserves I1/I12; production integration and complete endpoint policy tests are still required by P1.1c/P1.13.
- **D15 – Platform schema integrity:** ADR-0023 uses composite live-parent foreign keys, historical non-cascading audit identifiers, core-derived Postgres enums, and a purge flag that permits only expired DELETEs, never UPDATE. Auth membership uniqueness and UNLOGGED buckets are custom SQL invariants. Q7's recommended archive behavior is the M1 execution baseline; no incomplete hard-erasure/ownership-transfer route will be exposed. This does not authorize soft-deleting personal records or changing I1/I12.
- **D16 – Repository boundary:** ADR-0024 replaces raw tenant callbacks with scoped core/module repositories, context snapshots and transaction-lifetime guards. Existing auth transactions can enlist through nested savepoints on the same connection. Module repository factories are privileged composition bindings; domain/capability calls never receive the driver. Authentication/permissions still belong to P1.3b/P1.4c.
- **D17 – Abuse identity:** ADR-0025 uses atomic Postgres fixed windows and UTC-daily HMAC identities. Forwarded headers require an exact literal-IP proxy allowlist, empty by default; CIDRs/hostnames are intentionally unsupported initially. This preserves I11 and adds no infrastructure. Endpoint limits and auth persistence controls are still P1.1b/P1.4c.
- **D18 – Signup/auth execution baseline:** ADR-0026 implements Q6's conservative default (`invite_only`), explicit development `open` with Mailpit, required verification and no anonymous token fallback. Production bootstrap remains M6; invite-bound signup and owner/admin link fallback remain P1.1c. Email-verification replay claims are digest-only and expiring; delivery remains after commit, with durable retries in P1.10b. This is an implementation decision preserving the invariants, not a claim of maintainer confirmation of every Q6 detail.
- **D19 – Organization/invitation baseline:** ADR-0027 exposes only declared role/account-scope operations, serializes membership changes with an organization lock and audits before commit. New owner grants, deletion and leave/transfer routes stay disabled (Q7 baseline). A live owner/admin-issued invitation is the identity proof for constrained new-account signup, including manually delivered no-SMTP links; it cannot replace an existing account or password. Q6 confirmation remains open; this is the invariant-preserving implementation baseline.
- **D20 – Tenantless login signal:** A login precedes organization selection. ADR-0027 records successful commits as a fixed operational event with no identity/network/credential data. This clarifies F.6 rather than inventing an unscoped personal audit store. Account-level attributable login history is not claimed and would require its own retention design; tenant administrative history is attributable and transactional.
- **D21 – Management credential precedence:** ADR-0028 selects an explicit Authorization credential ahead of cookies with no fallback; session membership is rechecked and route parents determine project scope. Q9's conservative session-only organization/key-management baseline applies. Production key lookup and audited exposure handling remain P1.4c; the new resolver interface fails closed until wired.

- **D22 – Isolation and cache coverage:** ADR-0029 requires concrete matching probes for registered management operations, inventories Better Auth organization endpoints and disables test caching for live-service state. Dependency/shared-script hashes now invalidate typechecks. No new production endpoint or permission is introduced.

- **D23 – Initial project settings and pagination:** ADR-0030 reserves project settings as a strict empty object until typed feature fields exist and introduces shared keyset pagination with the first real collection route. Q7/Q9 are explicitly approved above; configuration archive is distinct from personal-data erasure.

- **D24 – Key protocol/catalog:** ADR-0031 uses unbiased base62 sampling, SHA-256 over the complete credential, eight-character token display excerpts and an enabled-module-aware v1 scope catalog. Unknown/disabled explicit grants fail; preset results expose their effective enabled grants. No new permission or production route is added by P1.4a.

- **D25 – Shared services and usage:** ADR-0035 uses frozen declared-provider views, one runtime provider lifetime and caller-transaction usage with UTC month-start dates and lossless bigint values. Self-hosted entitlements are unlimited through DI; optional storage/scanner/captcha/queue/billing are ports until their planned implementation tasks. No module gets a raw driver or unbound tenant selector.

- **D26 – Platform reads:** ADR-0036 reuses auth/project switcher contracts, keeps activity owner/admin session-only, serializes usage as lossless decimal strings and returns only an active publishable credential in integration metadata. Foreign collection filters disclose nothing; direct foreign/conflicting project resources are 404. Module operational metadata remains P1.6b.

- **D27 – Static module contracts:** ADR-0037 captures typed hooks in normalized definitions, validates startup namespaces/dependencies, and gives callbacks only their own repository plus an exact caller-transaction handle. Shared services/capabilities preserve physical rollback; defaults/schema/migration/change classification are validated without fake production domain APIs. This refines §C while preserving I1/I7/I13/I19 and the approved Q5 fixture boundary. HTTP/worker mounting remains P1.6b/P1.9/P1.10.

- **D28 – Module availability:** ADR-0038 distinguishes enabled descriptors from operational definitions through one static catalog. Public metadata and project integration share a safe projection; unavailable primary namespaces return a fixed 404 without tenant reads. Domain APIs remain M2–M4, and generated client/dashboard consumption follows in P1.11b/P1.12.

- **D29 – Module host bridge:** ADR-0039 mounts selected hooks through the central policy/OpenAPI registrar and caller tenant transaction, shares module scopes between issuance/authentication and exposes selected job registrations to workers. Public execution fails closed until P1.9 authorization; durable scheduling stays P1.10. It introduces no bootstrap exception, domain API or new infrastructure.

- **D30 – Generic instances:** ADR-0040 uses required config-version preconditions, project locks and same-transaction revisions/audit/events for generated instance CRUD. Config PATCH merges then validates/classifies and recomputes retention through the module hook in that transaction; destructive writes and configuration archive require explicit destructive rights. Archive retains configuration/history and reserves keys; personal-record erasure remains separate planned lifecycle work. Operational test definitions exercise the API while M1 domain descriptors remain unavailable. The shared management registrar owns no-store responses.

- **D31 – Versioning:** ADR-0041 distinguishes write-free lazy views (`storedModuleVersion`) from explicit persisted migrations. Rollback replaces config through the shared destructive/version/retention/audit boundary and always creates a fresh revision; old history stays immutable. Persisting a format upgrade conservatively requires destructive permission. No invariant changes.

- **D32 – Config documents/plans:** ADR-0042 refines the unimplemented flat example into a versioned instance envelope under registry-derived plural module sections. Missing sections preserve state; explicit empty sections plan destructive archive. Stateless ten-minute HMAC plans bind normalized desired config, principal/tenant, persisted versions and selected schemas. Read-only planning introduces no write privilege or personal-data export.

- **D33 – Atomic apply/exports:** ADR-0043 rechecks signed plans and permissions under the existing project lock before reusing generic mutations in one transaction. No-op plans write nothing; stale/rebound plans cannot apply. Static JSON Schema and config-read-protected type exports derive from operational module definitions. No personal-record erasure or domain implementation is added.

- **D34 – Private storage:** ADR-0044 separates internal S3 I/O from browser signing, bounds URL TTLs, validates opaque keys/disposition/inline types and reuses checksum settings verified against Garage. Selected storage adds readiness/lifecycle wiring; storage-free installations do not construct or probe it. File detection and upload orchestration remain P3.

- **D35 – Proof of work and replay:** ADR-0045 uses altcha-lib's v2 SHA-256 protocol with an allowlisted payload schema, project-separated HMAC keys derived from `APP_SECRET`, ten-minute expiry checked against the injected clock and single-use claims through the shared Postgres replay store. No third-party verification, cookies or tenant identifiers enter a challenge.

- **D36 – Public request composition:** ADR-0046 adds validated per-instance public policy, a metadata envelope, transaction-bound quota/domain execution and project-bound CORS for declared public routes. The public fixture proves the pipeline; Q11 remains the explicit production authentication gate. This extends ModuleDefinition through one shared contract and changes no invariant.

- **D37 – Atomic public idempotency:** ADR-0047 lets public write routes opt in by declaring a JSON success status. Keys are stored as tenant/project-scoped SHA-256 digests over a canonical request fingerprint (proof/honeypot excluded); only committed successes replay, after project/key/origin/instance rechecks under the project lock. A mismatched fingerprint returns 409; revoked credentials cannot fetch a replay.

- **D38 – Transactional Postgres jobs:** ADR-0048 uses pg-boss 12.38.1 on the existing pool through its Drizzle transaction adapter, so a commit publishes domain changes and jobs together and a rollback discards both. Tenant IDs come only from the caller transaction; unknown/disabled jobs and invalid payloads fail closed. Modules keep the core Queue contract and never receive the driver.

- **D39 – Outbox and restricted delivery:** ADR-0049 claims pending events with `FOR UPDATE SKIP LOCKED` and enqueues consumers plus the dispatched marker in one transaction, with deterministic per-event job IDs so retries never duplicate work. The host dispatcher pages organization IDs through the existing identity-table exception and opens `withTenant` for every business/outbox operation. Consumers receive a structural projection, never tokens or personal content.

- **D40 – Bounded worker maintenance:** ADR-0050 deletes at most 100 expired rows per table/transaction with `SKIP LOCKED`. Audit, outbox and idempotency cleanup runs org-scoped, including archived projects; audit deletion sets the trigger override transaction-locally and only removes rows expired by both the injected clock and PostgreSQL time. Active identities, credentials and memberships keep their Q8 lifecycle.

- **D41 – Offline contract and admin client:** ADR-0051 generates `openapi.json` and its TypeScript types offline from the real route registration, with no database, SMTP, storage or network access and no mocked behavior. Generated files are committed and never hand-edited; domain routes and fixtures are not invented in the production contract.

- **D42 – Contract gates and method handling:** ADR-0052 runs `api:check` as a non-destructive byte comparison and `api:breaking` with oasdiff (pinned in `mise.toml`) against the resolved base commit; bootstrap is allowed only when that commit has no contract. Unknown methods on declared paths inherit the path's access policy before returning 405.

- **D43 – Dashboard account boundary:** ADR-0053 uses the pinned Better Auth React/organization clients without importing the server auth instance, adds the CSRF header through a same-origin client and reads only signup policy, email availability and minimum password length from a public capability endpoint. Reset tokens stay in component memory and leave the address bar immediately; no form library, analytics or persistent token storage is added.

### Decided in P2 planning, please confirm

- **D44 – Spam verdict values:** use the implemented core verdict `clean|suspect|spam` (`packages/core/src/abuse/policy.ts`) instead of §B.3's `ok|suspect|spam`; one source of truth.
- **D45 – Full-text search:** Postgres `simple` configuration (language-neutral, en/de content) over text-like field values only, computed on insert; queries via `websearch_to_tsquery`. No `source` or consent metadata in the index.
- **D46 – Data access rights:** sessions follow §E.4. Secret keys: `data:read` lists/reads, `data:write` patches, `data:delete` deletes (single and bulk). CSV export is owner/admin session only in M2 (no key scope), audited and rate limited.
- **D47 – Test entries:** `is_test` exists from P2.3b with a dashboard badge and filter; the creation path (`test:write`, `backbricks test submit`) arrives with the CLI in P5.4.
- **D48 – Public schema reads are rate limited:** forms add the first production public read route, so the P1 review's L2 is decided now: a light per-IP limit and `Cache-Control` on `GET /v1/public/forms/{key}`.
- **D49 – Notification throttling:** at most 10 mails per rule per hour, then one content-free hourly digest with the count; configurable per rule within a bounded range.
- **D50 – Release mechanics:** Changesets for the changelog; a tag-triggered workflow pushes the image to `ghcr.io/nolliebigspin/backbricks` (Q3). The maintainer creates and pushes the signed tag.

### Decided during P2 execution, please confirm

- **D56 – Audited CSV streaming:** [ADR-0058](docs/adr/0058-audited-paged-csv-exports.md) adds bounded management rate policies and a CSV-only text-stream port using fresh, module-owned read transactions after the initial audit commits. Exports retain a started audit even if canceled, add the actual row count on completion, and use `data.<key>` columns to distinguish user fields from metadata. Keyset pages permit concurrent changes rather than claiming a single database snapshot. No invariant changes.

- **D55 – Forms mutations and batched erasure:** [ADR-0057](docs/adr/0057-forms-data-mutations-and-batched-erasure.md) uses locked, all-or-nothing batches with the shared 100-ID ceiling; every mutation audits in the same transaction. Admin-session delete-all enqueues bounded, resumable Postgres batches and records one final count. All deletion paths borrow the specified `files.deleteByOwner` capability when present; core types only that existing deletion seam before M3 adds claiming/listing. No invariant changes.

- **D54 – Module-owned configuration reads:** [ADR-0056](docs/adr/0056-module-owned-instance-reads.md) adds read-only current/historical config access fixed to the module and caller transaction. Modules never receive platform repositories or tenant selectors. The bridge strips its host-only project selector before strict module validation. Opaque HTTP JSON schemas reuse the existing JSON validator and enforce JSON-safe responses centrally to avoid recursive OpenAPI generation failure. No invariant changes.

- **D51 – Config validation errors keep their paths:** `validatedConfig` (core) returns `validation_failed` with `errors[]` (paths relative to the module config; module refinement messages only, built-in Zod messages replaced so no input is echoed) instead of a path-less problem. A module refinement tagged `{ code: 'capability_unavailable' }` becomes that problem, which is how forms rejects `file` fields without uploads (§C.7) without a `ModuleDefinition` change.

- **D52 – Public handler context and read limits:** [ADR-0046's P2.4a addendum](docs/adr/0046-public-write-guard-and-cors.md#p24a-addendum-2026-11-09-d52) passes the guard's validated instance config to public handlers and gives writes only minimized source metadata (origin, Referer pathname, browser family, rotating IP hash). Reads use a separate 60/min IP/instance bucket; the executor preserves an explicit route cache policy and otherwise uses `no-store`. No public response fields, invariant or bootstrap exception are added.

- **D53 – Plain HTML transport:** [ADR-0046's P2.4b addendum](docs/adr/0046-public-write-guard-and-cors.md#p24b-addendum-2026-11-09-d53) makes urlencoded posts an explicit per-route opt-in, with shared flat-field/proof decoding and trusted transport context. Configured redirects are checked against current project origins before processing and under the transaction lock; absent/disallowed success targets prevent storage. Errors contain only structural codes/paths, through a validated error redirect or escaped HTML/CSP fallback, including early body/auth failures. `altcha` is reserved for proof; native forms rely on proof replay protection/rate limits rather than an idempotency header.
