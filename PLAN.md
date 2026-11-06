# PLAN – Backbricks

> The only task list. Milestones, scope and exit criteria: [`docs/MILESTONES.md`](docs/MILESTONES.md). Decisions for the maintainer: [`OPEN_QUESTIONS.md`](OPEN_QUESTIONS.md). Key decisions: [`docs/adr/`](docs/adr/). How phases are planned and executed: `AGENTS.md` §9.
> **State:** P0 done (report: [`docs/progress/phase-0.md`](docs/progress/phase-0.md)). P1 planned on 2026-11-06; resolve its decision gates in `OPEN_QUESTIONS.md` before the affected tasks. P2–P6 and C1–C3 remain stubs.

## Task format

Planning a phase replaces its stub with tasks of 2–6 h each. Keep the stub IDs; sub-tasks get suffixes (`P1.3a`).

```markdown
### [ ] P1.3 – Title (est. 3 h)
- **Description:** …
- **Files/packages:** …
- **Depends on:** …
- **Reuses:** existing code/helpers this builds on, so nothing gets duplicated
- **Acceptance criteria:**
  - [ ] …
- **Tests:** …
- **Risks/notes:** …
```

Each phase ends with a **Phase acceptance** checklist: the milestone's exit criteria, each with the command that proves it.

## Overview

- **Total estimate:** P0 **47 h ≈ 5.9 PD**; P1 **182 h ≈ 22.8 PD**, plus a **36 h (~20%) reserve**, giving **218 h ≈ 27.3 PD** as the planning envelope. P2–P6 retain their milestone ranges (**41–53 PD**). **OSS track ≈ 70–82 PD before the P1 reserve, 74–86 PD including it.** Cloud track (C1–C3): **15–21 PD**. P1's detailed estimate is a proposed revision to its original 12–15 PD allowance, not an approved budget increase or scope change.
- P0 is about 1 PD over the planned 4–5 PD. The extra comes from the library spike, the Garage init (the Garage image has no shell) and the Docker setup for Bun's isolated linker. DEV-4 and DEV-7 keep P1 work out of P0.
- **Milestones:** see [`docs/MILESTONES.md`](docs/MILESTONES.md) (M0–M6, C1–C3). Phase P*n* → milestone M*n*.
- **P0 execution order** (IDs unchanged): P0.1 → P0.2 → P0.3a → P0.3b → **P0.9a → P0.9b** → P0.4 → P0.6 → P0.5a → P0.5b → P0.7 → P0.8a → P0.8b. The spike runs early because it needs the compose services (Postgres, Garage), and its findings feed P0.2, P0.5 and P0.6.

### TypeScript 7 decision rule

`typescript@7.0.2` (the version the repo pins) has no classic JavaScript compiler API: the npm package exports only `version.cjs` and `unstable/*`. Tools that call `require('typescript')` are affected: dependency-cruiser's TS parsing (P0.2), `openapi-typescript` (P1.11) and possibly the Better Auth CLI. The maintainer prefers to stay on TS 7 if it works; TS 6 is an acceptable fallback. Rule, applied in P0.2 and P0.9b:

1. TS 7 stays the compiler for `tsc` typechecking.
2. If a tool fails on TS 7, use a fallback local to that tool first: dependency-cruiser's `parser: "swc"` (`@swc/core`), or an older `typescript` devDependency in the one package that runs a code generator (`docs/ARCHITECTURE.md` §H allows this).
3. Only if a P0/P1 tool can't work that way, switch the whole repo to `typescript@6.0.3` (DEV-6). Then update the "TypeScript 7" mentions (ARCHITECTURE §0 #2, §H, §J.1 #10; AGENTS.md §4; README) and record it in ADR-0020.

`oxlint-tsgolint` bundles its own typescript-go and works either way.

### Version list

P0 versions checked 2026-11-04. New P1 dependencies rechecked 2026-11-06 with `npm view <pkg> version` / `dist-tags`; changed candidates are identified below. Pin exactly when adding. A newer candidate is not evidence of Bun compatibility: repeat the relevant ADR-0020 smoke checks before adopting it. Existing installed dependencies stay pinned unless the task needs an upgrade.

| Area | Package | Version | Bun-compatible | Notes / fallback |
|---|---|---|---|---|
| Tooling | bun | 1.4.4 | – | pinned in `mise.toml`, `packageManager` |
| | typescript | 7.0.2 | yes (native) | no JS API → decision rule; fallback 6.0.3 |
| | turbo | 2.11.10 | yes | in repo |
| | oxlint / oxlint-tsgolint | 1.91.0 / 7.0.2005 | yes | in repo; type-aware mode on |
| | oxfmt | 0.76.0 | yes | in repo; 0.x |
| | lefthook | 2.2.2 | – | mise |
| | @types/bun | 1.4.4 | – | in repo |
| | node | 24 | – | mise; Playwright + Node compat tests |
| Arch rules | dependency-cruiser + @swc/core | 18.7.2 + 1.16.21 | runs via its Node shebang (mise Node 24) | P0.2: no TS 7 support (`typescript <7`), so `.ts`/`.tsx` are parsed with `parser: "swc"`; type-only imports are still traced. `tsPreCompilationDeps` is off because it needs the TS compiler |
| Server | hono | 4.13.16 | yes | native `Bun.serve` |
| | zod | 4.6.7 | yes | |
| | pino / pino-pretty | 10.4.0 / 13.2.0 | yes | pino-pretty dev only |
| | typeid-js | 1.2.0 | yes | check license in P0.6; alternative: own encoder on `Bun.randomUUIDv7()` |
| DB | drizzle-orm / drizzle-kit | 1.0.0-rc.5 / 1.0.0-rc.5 | yes (ADR-0020) | RC chosen (Q1, 2026-11-05); stable 0.45.4 / 0.31.11 is the fallback; upgrade to 1.0 GA when released |
| | pg / @types/pg | 8.23.1 / 8.23.1 | yes (ADR-0020) | one driver shared with pg-boss |
| Web | vite / @vitejs/plugin-react | 8.3.5 / 6.2.1 | yes (`bun --bun vite`) | |
| | react / react-dom | 19.3.1 | yes | in repo (`packages/ui`, `apps/www`) |
| | @tanstack/react-router / router-plugin | 1.170.46 / 1.168.48 | yes | file-based routes |
| | @tanstack/react-query | 5.105.3 | yes | |
| | i18next / react-i18next | 26.7.1 / 17.1.12 | yes | |
| | tailwindcss / @tailwindcss/vite | 4.3.4 | yes | in repo |
| | react-hook-form / @hookform/resolvers | 7.91.0 / 7.0.3 | verify together in P1.12a | Resolvers patch updated in the 2026-11-06 check |
| Tests | @playwright/test | 1.64.1 | Node via mise | |
| | fast-check | 4.10.2 | yes | |
| | happy-dom / @happy-dom/global-registrator | 21.0.4 | yes | in repo |
| | @testing-library/react | 16.3.3 | yes | in repo |
| Spiked in P0.9, used later | better-auth / `auth` CLI / @better-auth/drizzle-adapter | 1.7.18 / 1.7.18 / 1.7.18 | P1.1a must verify this patch | Current P1 targets; P0 spike used 1.7.17 / 1.7.16. Match runtime, adapter and CLI; inspect pinned exports rather than copying newer docs. CLI via `bun run auth`; deterministic schema-generation normalization if the relations import still needs it |
| | pg-boss | 12.38.1 | P1.10a must verify this patch | P0 used 12.38.0; recheck `fromDrizzle(tx, sql)` commit/rollback and shutdown |
| | @aws-sdk/client-s3 / @aws-sdk/s3-request-presigner | 3.1163.0 (P1 target) | paired upgrade verified in P1.8e | client-s3 3.1161.0 already installed at root; latest of both is 3.1163.0. Align versions when adding presigner; no unrelated upgrade. Preserve checksum settings and signed length/type tests from ADR-0020 |
| | altcha-lib | 2.8.0 | yes (ADR-0020) | v2 API with `altcha-lib/algorithms/sha` |
| | @modelcontextprotocol/sdk | 1.32.2 | yes, Bun and Node 24 (ADR-0020) | must also run on Node ≥ 20 (I18) |
| | nodemailer / @types/nodemailer | 10.3.1 / 8.0.2 | yes (P1.8b) | Bun Mailpit delivery and safe failure tests pass; Node delivery probe passes; used API typechecks despite types' older major |
| | file-type | 22.3.0 | to verify (P3.4) | |
| | @hono/zod-openapi | 1.6.3 | yes | peer zod ^4, hono ≥4.10 |
| | openapi-typescript | 7.13.0 | yes, with fallback (ADR-0020) | fails on TS 7; works with `typescript@5.9.3` local to `api-contract` |
| | openapi-fetch | 0.17.0 | to verify in P1.11b | Separate admin export keeps this dependency out of the browser SDK entry point |
| API comparison | oasdiff | 1.35.0 | native binary | Latest GitHub release checked 2026-11-06; add exact tool pin only in `mise.toml` in P1.11c, use local CLI in CI; no hosted spec upload |
| Images | postgres | 18.6-alpine | – | |
| | dxflrs/garage | v2.5.0 | – | `FROM scratch`, no shell → init via Bun script |
| | axllent/mailpit | v1.33.0 | – | |
| | clamav/clamav | 1.5.4-debian | – | arm64 only in the `-debian` variants |
| | oven/bun | 1.4.4 (dev) / 1.4.4-slim (runtime) | – | |
| | caddy | 2.11.7 | – | P6 |

## Proposed deviations from ARCHITECTURE.md

- [x] **DEV-1: Drop `packages/tsconfig`.** The root `tsconfig.base.json` is already the shared preset (`packages/ui` and `apps/www` extend it). A separate package adds a workspace and nothing else. *Impact:* §G.1 tree, LICENSING.md path list, P0.1. *Accepted 2026-11-05;* P0.1 updates both docs.
- [x] **DEV-2: Internal packages ship as TS source.** `exports` point to `src/index.ts` (as in `packages/ui`); Bun and Vite consume TypeScript directly. `build` exists only where an artifact ships: `apps/web`, `apps/www`, later `packages/sdk` and `packages/cli`. The server image runs its source with Bun. *Impact:* P0.1 "Turborepo tasks per package (`build`, …)" becomes `typecheck`/`test` per package, `build` where needed. *Recommendation:* accept.
- [x] **DEV-3: `ids` and tenancy types live in core.** P0.6 puts the TypeID helper in `packages/db`, but modules may only import `@backbricks/core` (I13) and need to generate IDs. The TypeID helper and the `TenantContext`/`WithTenant` types go to `packages/core`; `packages/db` implements `withTenant`. *Recommendation:* accept.
- [x] **DEV-4: `/readyz` checks only the database in P0.** The check list is pluggable (`ReadinessCheck[]`); the S3 adapter adds its check in P1.8. Otherwise P0 would need the AWS SDK and a storage adapter early. *Recommendation:* accept.
- [x] **DEV-5: Env access is banned with `node/no-process-env` and `no-restricted-properties` (`Bun.env`, `import.meta.env` outside apps/web).** The originally planned `no-restricted-imports` can't catch property access. Overrides: `packages/core/src/config/**`, `scripts/**`, `*.config.ts`. *Recommendation:* accept.
- [ ] **DEV-6 (only if triggered): repo-wide TypeScript 6.0.3.** Step 3 of the TypeScript 7 decision rule. Changes key decision #2, recorded in ADR-0020 with the doc updates listed above.
- [x] **DEV-7: No `setup` role stub in P0.** The first-run setup arrives with P6.2; a stub that only prints "not implemented" is dead code (AGENTS.md golden rule 6). P0 ships `serve | worker | all | migrate`. The P0 worker connects to the DB, logs ready, idles and shuts down cleanly (pg-boss comes in P1.10). *Recommendation:* accept.
- [ ] **DEV-8: Bring the admin client forward to P1.11b.** Generate contract types in `api-contract`; the MIT `sdk/admin` entry point imports them as types only and wraps `openapi-fetch`. P5.2 finishes packaging/documentation. Add a specific architecture-rule fixture for this declared public subpath; do not relax deep-import rules generally. No server/auth runtime imports in the dashboard or SDK. *Impact:* §D.7, P1.12, P5.2; **Q5**.
- [ ] **DEV-9: Test the M1 module framework with test-only modules.** There are no domain modules in M1, yet P1.6 asks for single-module boots. Exercise full definitions and all capability/infrastructure combinations with synthetic fixtures; retain the existing domain infrastructure declarations once, and replace them with full definitions in P2–P4. Do not invent production forms/upload/review schemas to fill the contract. Clearly distinguish shipped descriptors from operational modules in metadata. Real single-module acceptance is added as each domain module lands. *Impact:* §C.7, P1.6, P2–P4; **Q5**.
- [x] **DEV-10: Make the auth/schema/transaction boundary explicit.** P1.1a proved the request-scoped outer transaction in [ADR-0021](docs/adr/0021-auth-transactions-and-schema-ownership.md), including negative control showing the stock adapter option alone is insufficient. Generated tables belong to db; auth receives schema/connection/services via injection. No I12 waiver; durable production integration remains P1.1c.
- [ ] **DEV-11: Resolve privacy and deletion gaps before schema/API implementation.** §B.3's audit labels, recipients and cached idempotency responses do not all have explicit expiry; the idempotency table lacks `organization_id` despite I1. §F.4's hard deletion differs from P1.5's soft project deletion. Propose tenant/expiry constraints, minimized audit labels, and separate archive vs. erasure semantics; do not copy the SQL spec literally. *Impact:* §B.3, §F.4, I1/I11; **Q7/Q8**. Architecture text changes only with the accepted decision/ADR during execution.

## Phase P0 – Foundation (M0) · done

All tasks are done; the task details are in the git history of this file, the results, deviations and evidence in [`docs/progress/phase-0.md`](docs/progress/phase-0.md).

- [x] P0.1 – Workspace packages
- [x] P0.2 – Architecture rules
- [x] P0.3a – Compose: infrastructure services
- [x] P0.3b – Compose: app services
- [x] P0.9a – Library spike: database libraries
- [x] P0.9b – Library spike: storage, PoW, MCP, codegen; ADR-0020
- [x] P0.4 – Config
- [x] P0.6 – Database package
- [x] P0.5a – Server application
- [x] P0.5b – Process roles
- [x] P0.7 – Dashboard skeleton
- [x] P0.8a – Production Dockerfile
- [x] P0.8b – CI completion and Playwright scaffold
- [x] CI green on a PR against `main`: [PR #4](https://github.com/nolliebigspin/backbricks/pull/4), merged 2026-11-06; quality, tests, E2E, image and DCO checks succeeded (rechecked during P1 planning).

## Phase P1 – Platform Core (M1) · planned 2026-11-06

**Goal:** A multi-tenant platform with all M1 contracts and owner workflows, no domain modules. **39 tasks, 182 h ≈ 22.8 PD; reserve 36 h; envelope 218 h ≈ 27.3 PD.** Original allowance: 12–15 PD. This detailed estimate includes tests and task review; the reserve covers auth/transaction and RC/tooling uncertainty. Estimates assume Docker is running and P0's pinned tools are installed. At 15–20 h/week, base effort is roughly 9–12 weeks, or 11–15 weeks including reserve; agents work sequentially.

**Execution:** Tasks appear in dependency order, deliberately retaining the original P1.1–P1.13 IDs with suffixes. Complete them top to bottom. Resolve Q5–Q9 by their stated gates; P1.1a can investigate before those answers. Refer to ARCHITECTURE §B/§C/§D/§E/§F and ADRs 0005–0014, 0019, 0020. Paths below describe intended owners, not files that already exist.

**Sequential handoff:** The maintainer assigns either Claude or Codex; they use the same checkout and feature branch, never simultaneously. On entry inspect `git status`/`git diff`, read decisions and the first unticked task. Leave a short handoff in this phase's execution notes when stopping mid-task (task ID, changes, commands/results, next step); do not tick incomplete work. Human review precedes signed-off commits (AGENTS §8). Do not push or open a PR without instructions. No worktrees, agent coordinator or second task tracker are needed.

### [x] P1.1a – Prove the auth, schema and audit integration (est. 4 h)
- **Description:** Inspect the pinned Better Auth adapter/organization implementation, enumerate exposed tenant endpoints, and run a disposable Postgres spike of member/invitation mutation + audit rollback. Select the boundary in DEV-10, including caller identity and connection ownership.
- **Files/packages:** proposed ADR in `docs/adr/`, `OPEN_QUESTIONS.md`; throwaway spike outside production source.
- **Depends on:** P0 complete; real Postgres available.
- **Reuses:** ADR-0020, `createDatabase`, `createWithTenant`, migration test fixtures.
- **Acceptance criteria:**
  - [x] Reproducible commands prove both successful atomic commit and rollback when audit fails; direct plugin endpoints cannot bypass the chosen mechanism.
  - [x] ADR defines schema ownership, transaction propagation, auth-table exception to scoped repositories, and endpoint coverage. If I12 cannot be met, stop dependent auth work and present options; do not approve an after-commit audit workaround.
- **Tests:** Real DB spike for member role change, invitation acceptance and org creation; recheck Better Auth/CLI patch and generated relations import.
- **Risks/notes:** Time-box discovery. Public docs describe organization hooks but do not establish our same-transaction guarantee; unresolved findings get a new bounded task, not an assumed API.

### [x] P1.11a – Establish declared OpenAPI routes (est. 4 h)
- **Description:** Add OpenAPI routing and one route-registration contract carrying credential policy, role/scope requirements, body limit and isolation fixture metadata. Keep business policies in core and HTTP wiring in server.
- **Files/packages:** `packages/core/src/http/`, `apps/server/src/routes/`, app/context/error wiring.
- **Depends on:** P1.1a endpoint inventory.
- **Reuses:** `createApp`, `AppError` catalog, request context, health/dashboard routing.
- **Acceptance criteria:**
  - [x] The first management route must declare access policy; raw registrations are detected by a coverage test, not silently omitted from the manifest.
  - [x] Inputs use Zod, responses have explicit public/management shapes, and `/v1/openapi.json` excludes secrets and internal schema details. Document narrow exemptions for health/auth/static routes.
- **Tests:** Deliberately undeclared route fails; validation/problem responses, body limits and SPA/API separation remain correct.
- **Risks/notes:** ADR-0005; keep library-specific router types at the HTTP boundary. P1.11b/c finish codegen and CI, not route conversion.

### [x] P1.2a – Generate and migrate the auth schema (est. 4 h)
- **Description:** Generate Better Auth tables for the selected configuration into db-owned schema and start the single migration history. Use a schema-generation config that does not import its own output or connect at import time.
- **Files/packages:** `packages/db/src/schema/`, `packages/db/drizzle.config.ts`, migrations, auth generation config/script.
- **Depends on:** P1.1a; Q8 privacy boundaries.
- **Reuses:** P0 migration runner/advisory lock, package exports, exact version list.
- **Acceptance criteria:**
  - [x] `bun run auth:generate` runs the CLI with deterministic normalization and formatting; regeneration is byte-for-byte even with an unreachable DATABASE_URL. Generated files are never hand-edited; required relations imports are preserved.
  - [x] Clean migrations and no-op reruns pass; db never imports auth runtime. Auth tables/indexes/expiry and identity→membership cascade are covered by real DB tests.
- **Tests:** Auth schema generation repeatability; real migration concurrency and startup schema smoke tests.
- **Risks/notes:** DEV-10; inspect current package exports. Root TS 7 stays; codegen fallback is local only.

### [x] P1.2b – Migrate the platform schema and constraints (est. 6 h)
- **Description:** Implement §B.3 core/helper tables without domain tables, resolving DEV-11 before copying the SQL. Add tenant-consistent foreign keys, unique constraints, retention columns and the append-only audit trigger.
- **Files/packages:** `packages/db/src/schema/`, migrations; link implemented core tables from ARCHITECTURE §B.3.
- **Depends on:** P1.2a; Q7/Q8 decisions.
- **Reuses:** IDs in core, generated auth organization/user references, migration runner.
- **Acceptance criteria:**
  - [x] Projects, keys, instances/revisions, events, audit, notification rules, usage and technical tables exist; project-scoped idempotency also carries `organization_id`. Global tables are explicitly classified.
  - [x] Cross-org and sibling-project references fail at the DB boundary; audit update/delete fails except expired-row purge, with no transaction-local flag leakage. Audit survives parent erasure; expiry/indexes follow ADR-0022/0023.
- **Tests:** Real DB constraints, cascade behavior, append-only protection, clean migration and second-run no-op.
- **Risks/notes:** Notification CRUD belongs to P2.6. No forms/files/reviews tables, silent audit-retention exception or speculative cloud tables.

### [x] P1.3a – Implement tenant-bound repositories (est. 6 h)
- **Description:** Extend core tenancy contracts with scoped repository interfaces and an opaque transaction identity; implement them in db. Domain consumers never receive an unrestricted Drizzle handle. Define module repository/capability transaction extension without importing db into core/modules.
- **Files/packages:** `packages/core/src/tenancy/`, `packages/db/src/with-tenant.ts`, `packages/db/src/repositories/`, architecture fixtures.
- **Depends on:** P1.2b, P1.1a boundary decision.
- **Reuses:** `TenantContext`, `WithTenant`, `createWithTenant`, parameterized `set_config`.
- **Acceptance criteria:**
  - [x] Core repositories scope organization/project, reject foreign parents, stamp tenant IDs, protect writable fields and return not-found for foreign resource lookup. Contexts are snapshots; escaped handles fail after transaction end.
  - [x] Core/module repositories and outer auth transactions enlist on the same connection/savepoints. The negative architecture fixture rejects route→table imports; boundaries and module binding contract are ADR-0024.
- **Tests:** Real transactions across 2 orgs × 2 projects; empty/reused context, rollback and transaction-local setting isolation; capability fixture writes roll back together.
- **Risks/notes:** I1–I3/I13. RLS remains deferred; transaction settings alone do not scope a SQL query.

### [x] P1.8a – Add transactional audit and events (est. 4 h)
- **Description:** Add core AuditService/EventService and db implementations that require the caller's transaction. Restrict audit diffs and event payloads to safe metadata.
- **Files/packages:** core service contracts, db repositories, server dependency wiring.
- **Depends on:** P1.3a.
- **Reuses:** Clock, Ids, tenant repositories, append-only trigger, redaction utilities.
- **Acceptance criteria:**
  - [x] Real DB constraint failures prove mutation/audit/outbox rollback together; services require the caller's tenant transaction and never open another one. Runtime container composition remains P1.8d.
  - [x] Strict bounded metadata excludes content, readable labels and secret-shaped values; validation failures expose no input values. Injected clock determines one-year audit and 30-day outbox expiry.
- **Tests:** Force audit/outbox failure and assert no mutation survives; malicious config/key payloads never enter audit diffs or logs.
- **Risks/notes:** I4/I11/I12; secret exposure uses a committed security-event transaction before returning the rejection.

### [x] P1.8b – Add the SMTP mailer and safe templates (est. 4 h)
- **Description:** Define mailer contracts, SMTP implementation and verification/reset/invitation/exposure templates; make SMTP absence an explicit capability with the Q6 behavior.
- **Files/packages:** core mail contracts, `packages/adapters/src/mail/`, server composition.
- **Depends on:** P1.8a; Q6 signup/no-SMTP policy.
- **Reuses:** `Config.mailer`, `PUBLIC_URL`, Mailpit compose service, existing redaction.
- **Acceptance criteria:**
  - [x] URLs are built from trusted base URL and validated paths; HTML escapes user values and plain text treats them literally. SMTP errors expose no recipients, credentials or bearer links; provider diagnostics and external resource access are disabled.
  - [x] SMTP absence remains the explicit nullable config capability. Permission-gated invitation fallback and anonymous token non-disclosure are verified with the actual auth routes in P1.1b/c; runtime composition is P1.8d.
- **Tests:** Mailpit delivery with hostile display names, template escaping properties, SMTP failure and missing-SMTP behavior.
- **Risks/notes:** Provider delivery happens after commit; do not send an email for a transaction that later rolls back. Durable retries arrive in P1.10b.

### [x] P1.8c – Add shared rate limits and private IP identity (est. 4 h)
- **Description:** Implement Postgres and memory rate limiters with the same contract; centralize rotating IP HMAC and trusted proxy address resolution for auth/public endpoints.
- **Files/packages:** core contracts/pure helpers, adapter rate limiter, server request context, config.
- **Depends on:** P1.2b.
- **Reuses:** `clock`, `APP_SECRET`, `rate_limit_buckets`, config validation and HTTP connection info.
- **Acceptance criteria:**
  - [x] Atomic counters enforce concurrent fixed-window limits and report retry time; memory implementation is for tests/single-process use. Postgres remains the production store; container binding is P1.8d.
  - [x] Socket addresses are canonicalized and immediately hashed in request context; no clear IP is persisted/logged by this flow. Exact-IP proxy allowlist defaults empty. Bucket schemas require separate auth/public/management namespaces and digest identities; auth uses the helper in P1.1b.
- **Tests:** Concurrent Postgres increments, window boundaries, daily HMAC rotation, forged forwarding headers and no raw IP leakage.
- **Risks/notes:** I11; no Redis. Bucket cleanup is P1.10c.

### [x] P1.1b – Implement dashboard authentication (est. 6 h)
- **Description:** Wire email/password, verification, reset, session lifecycle, signup policy and telemetry-off configuration; mount the approved `/api/auth/*` surface with limits.
- **Files/packages:** `packages/auth/`, core config, server composition/auth routes, `.env.example`.
- **Depends on:** P1.2a, P1.8a/b/c, P1.11a; Q6/Q8.
- **Reuses:** Better Auth built-in auth flows, mailer and endpoint inventory from P1.1a.
- **Acceptance criteria:**
  - [x] Signup policy is injected into library and handler; invite-only cannot be bypassed. Verification/reset are expiring and single-use; email actions return generic responses, avoid SMTP latency and apply a response floor. D18/ADR-0026 record the Q6 execution baseline.
  - [x] Production cookies are Secure/HttpOnly/SameSite=Lax; HTTP development exception is explicit. Trusted origins/callbacks, CSRF, bounded streams and shared throttling cover the mounted allowlist. Unknown plugin routes fail closed; session metadata stores only the daily digest and no full UA.
- **Tests:** Real HTTP/DB signup/login/logout/reset/verification, invalid/expired tokens, cross-origin mutations, cookie flags and no token logging.
- **Risks/notes:** Do not build the M6 setup wizard. Auth error bodies may follow Better Auth's contract; `/v1` errors remain RFC 9457.

### [x] P1.1c – Implement organizations, members and invitations (est. 6 h)
- **Description:** Expose the approved organization lifecycle/member/invitation surface with owner/admin/member policy and transactional auditing, using Better Auth rather than parallel membership tables.
- **Files/packages:** auth organization integration, server organization routes/policies.
- **Depends on:** P1.1b; proven P1.1a integration.
- **Reuses:** Better Auth organization plugin, audit/event services, mailer, auth schema.
- **Acceptance criteria:**
  - [x] Create/select, invite/accept/cancel, removal and role changes work; admins cannot change owners. Concurrent owner demotions preserve an owner; removed members' next request is rejected. New owner grants and deletion/leave/transfer routes remain disabled per D19.
  - [x] Every tenant administrative mutation audits and publishes metadata before commit through the same outer transaction. Role/input/isolation declarations govern the closed raw-plugin surface. Invitation identity/expiry/replay/foreign-parent checks fail closed; account/session creation rolls back with failed membership audit.
  - [x] No-SMTP links are returned only to the authorized inviting owner/admin. New signup is constrained to live matching invitation proof and cannot replace an existing account/password; reset/verification endpoints still disclose no anonymous tokens. ADR-0027 records the Q6/Q7 baseline and tenantless-login clarification.
- **Tests:** Real DB rollback injection, concurrent last-owner changes, role matrix and raw-plugin bypass attempts.
- **Risks/notes:** Organization deletion/ownership transfer exposure follows Q7; disabled endpoints must reject direct calls, not merely disappear from the UI.

### [x] P1.3b – Resolve principals and enforce declared permissions (est. 4 h)
- **Description:** Bind trusted session principals/membership to TenantContext; implement role/scope policies and credential precedence. Define the key-resolver interface for P1.4c.
- **Files/packages:** core principal/policy contracts, server auth/tenant middleware, route manifest.
- **Depends on:** P1.1c, P1.3a, P1.11a; Q9 route policy.
- **Reuses:** Better Auth sessions, scoped repositories, AppError and request context.
- **Acceptance criteria:**
  - [x] Current membership and scoped project lookup bind a frozen principal/context. Headers and active-org claims are selectors only. Path-derived tenant metadata constrains key identities; real key discovery is the P1.4c resolver implementation.
  - [x] Real HTTP/DB cases prove foreign 404, unauthenticated 401, owned-resource denial 403, role changes/removal, origin/CSRF and publishable-key denial. Explicit bearer credentials never fall back to cookies. Principal scopes remain immutable through repository transactions.
- **Tests:** Cross-org/project principal substitution, conflicting credentials, removed memberships, role hierarchy and CSRF failures.
- **Risks/notes:** I2 is about existence leaks, not a blanket requirement that list endpoints always return 404.

### [x] P1.13a – Start the automatic isolation suite (est. 4 h)
- **Description:** Build real DB fixtures for 2 orgs × 2 projects × roles, with typed per-route resource builders and assertions generated from the registered management surface.
- **Files/packages:** `apps/server/test/isolation/`, `apps/server/src/tenant-isolation.test.ts`, auth endpoint inventory.
- **Depends on:** P1.3b.
- **Reuses:** P0 integration service availability checks and P1.11a route metadata.
- **Acceptance criteria:**
  - [x] Suite fails if an exposed management operation has no policy/fixture. Include tenant-bearing Better Auth paths, not just `/v1` routes.
  - [x] Resource paths test foreign 404, collections test filtering/non-disclosure, creation tests tenant binding, and denied mutations assert unchanged DB/audit state.
- **Tests:** Deliberately omit one route and deliberately un-scope a fixture repository to prove the suite detects both failures; no DB mocks.
- **Risks/notes:** Every later route task adds cases here before completion. Test runtime inspection guards against a manifest that omits mounted routes. Correct Turbo dependency/shared-script inputs and avoid caching service-unavailable skips; P1.3b verification uses `TURBO_FORCE=true` until this is addressed.

### [x] P1.5a – Implement projects and origins (est. 4 h)
- **Description:** Add project list/create/detail/update/delete behavior and normalized allowed origins under the Q7/Q9 policy.
- **Files/packages:** core project service/schemas, db repositories, server project routes.
- **Depends on:** P1.13a, P1.8a; Q7/Q9.
- **Reuses:** Tenant repositories, route declarations, Zod, audit/events and pagination contract.
- **Acceptance criteria:**
  - [x] Names/slugs/settings and HTTP(S) origins validate; origins have no credentials/path/query or permissive wildcard matching. Empty origin allowlist has the documented meaning.
  - [x] Project deletion/archive is explicit and audited; inactive projects reject their keys/public access. Referenced foreign project IDs cannot move records across tenants.
- **Tests:** Role/isolation matrix, duplicate slug, deceptive origin suffix/ports, deleted-project reads and all mutations' rollback.
- **Risks/notes:** No personal-data soft deletion by accident; apply the accepted Q7 semantics.

### [x] P1.4a – Implement key primitives and scope presets (est. 4 h)
- **Description:** Generate 32-character base62 CSPRNG tokens without modulo bias; derive hashes, display prefixes, scope schemas and named presets from one catalog.
- **Files/packages:** core key/scopes contracts and pure helpers, db key repository.
- **Depends on:** P1.3a; Q9 scope decisions.
- **Reuses:** `ids`, Web Crypto, AppError catalog, §D.1 presets.
- **Acceptance criteria:**
  - [x] Secret plaintext is returned only at creation; persistence stores SHA-256 and display metadata. Publishable plaintext is allowed only for publishable rows.
  - [x] Unknown scopes fail validation; agent preset excludes personal data/deletion/destructive rights; disabled module scopes cannot silently grant rights.
- **Tests:** Format/property tests, rejected scopes, expiry/revocation lookup and serialization/log snapshots excluding secrets.
- **Risks/notes:** Own website/agent keys remain separate from Better Auth sessions; do not add a second key plugin.

### [x] P1.4b – Add session-only key management (est. 4 h)
- **Description:** Add list/create/revoke routes with preset selection, explicit expiry and reveal-once responses.
- **Files/packages:** core key service, server key routes and isolation fixtures.
- **Depends on:** P1.4a, P1.5a, P1.13a.
- **Reuses:** Project repositories, route policy, audit and scope catalog.
- **Acceptance criteria:**
  - [x] Only authorized dashboard sessions create/revoke keys; responses never redisplay a secret. Metadata read policy follows Q9.
  - [x] Create/revoke and their redacted audit entry share a transaction; attempts with a key cannot mint another key or gain scopes.
- **Tests:** Owner/admin/member/key matrix, foreign key IDs, concurrent revoke and failed-audit rollback; public snapshots.
- **Risks/notes:** I4/I7; clipboard/UI behavior belongs to P1.12c.

### [x] P1.4c – Authenticate keys and reject exposed secrets (est. 4 h)
- **Description:** Finish the key resolver, project binding, scope enforcement, throttled last-used updates and foreign-Origin security handling.
- **Files/packages:** server credential middleware, key service/repository, mail/security event integration.
- **Depends on:** P1.4b, P1.8b/c, P1.3b.
- **Reuses:** SHA-256 lookup, normalized origins, audit/event transactions and limiter.
- **Acceptance criteria:**
  - [x] Expired/revoked/inactive-project keys fail; publishable keys only reach approved public routes. Exact dashboard origin is the documented secret-key exception.
  - [x] Foreign Origin with a valid secret returns `403 secret_key_exposed`, commits redacted audit/security notification intent and never executes the business action; incident emails are deduplicated/throttled.
- **Tests:** Origin variants including `null`, invalid/revoked secrets, cross-project resource IDs, concurrent last-used updates and audit failure path.
- **Risks/notes:** The rejection audit must survive the HTTP error; a rolled-back business transaction cannot be its only write. Also cover secret-shaped values in caller-controlled request IDs/paths and error/log strings; name-based field redaction and activity validation alone do not protect those HTTP sinks.

### [x] P1.8d – Add usage, entitlements and service composition (est. 4 h)
- **Description:** Complete the injected service container, transactional usage counters and UnlimitedEntitlements; define external-service interfaces required by the module contract without speculative adapters.
- **Files/packages:** core services/metrics contracts, db usage implementation, server composition.
- **Depends on:** P1.8a, P1.3a.
- **Reuses:** `Clock`, `Ids`, config/infrastructure contracts and usage table.
- **Acceptance criteria:**
  - [x] Usage increments in the caller's transaction with atomic UPSERT; monthly periods use injected time and tenant scope.
  - [x] Self-host limits are unlimited through DI; optional storage/scanner/captcha/billing contracts do not force infrastructure or cloud branches. Module config includes no undeclared service access.
- **Tests:** Concurrent counter increments/rollback, period boundary, unlimited checks and absent optional services.
- **Risks/notes:** No billing/plan implementation in M1; no replacement clock/ID abstractions.

### [x] P1.5b – Add organization activity and integration reads (est. 4 h)
- **Description:** Expose session organization/project switcher data, paginated activity and usage reads, plus project integration metadata for permitted keys.
- **Files/packages:** server organization/audit/usage/integration routes, core query services.
- **Depends on:** P1.8d, P1.4c, P1.13a; Q9.
- **Reuses:** Better Auth membership, audit/usage repositories, declared schemas and cursor pagination.
- **Acceptance criteria:**
  - [x] Dashboard sees only its organizations/projects and permitted activity; integration output contains publishable credentials, never secret tokens or personal data.
  - [x] Pagination is bounded, stable and filter validation is shared; permission metadata and isolation fixtures cover every route.
- **Tests:** Foreign cursor/filter tampering, role/scope matrix, public-safe integration response and audit redaction snapshots.
- **Risks/notes:** No billing UI, notification CRUD or personal-data export endpoints in this task.

### [x] P1.6a – Define modules and capabilities (est. 6 h)
- **Description:** Implement §C.1's typed ModuleDefinition, defineRegistry, capabilities, router/service/job/retention/privacy/codegen contracts and module configuration version rules. Record contract refinements in an ADR.
- **Files/packages:** `packages/core/src/modules/`, module test fixtures, ADR/index.
- **Depends on:** P1.8d, P1.11a, P1.3a; Q5 (DEV-9).
- **Reuses:** InfraRequirement/requiredInfrastructure, service container, declared routes and scope/event catalogs.
- **Acceptance criteria:**
  - [x] Duplicate types/resource names/scopes/events/capability providers and missing requirements fail startup; optional capabilities are typed and unavailable use fails clearly.
  - [x] A test module performs a capability write in its tenant transaction, registers routes/jobs and supplies config schema, retention/privacy and schema/codegen hooks without a forbidden import.
- **Tests:** Valid and invalid registries, dependency/provider ordering, disabled providers and cross-module rollback fixture.
- **Risks/notes:** No `any`, generic plugin loader or domain schemas. Zod config/JSON Schema must have representable public output.

### [x] P1.6b – Wire module selection and metadata (est. 4 h)
- **Description:** Derive startup config, routes/jobs/services/readiness and web availability from selected descriptors/definitions, following DEV-9 during M1.
- **Files/packages:** server modules/main/roles, core config, module shells' exports, web registry boundary.
- **Depends on:** P1.6a; Q5.
- **Reuses:** Existing module infrastructure exports, parseModuleList, readiness checks and compose profiles.
- **Acceptance criteria:**
  - [x] Fixture registry boots empty, each single-module case and all combinations; storage/scanner are required only by enabled definitions. Unknown selection/capability errors fail startup clearly.
  - [x] `GET /v1/meta` reports operational availability truthfully; disabled module paths return `module_not_enabled` without exposing tenant data. M1 domain shells expose no working domain API.
- **Tests:** Boot matrix (including no storage), route/job absence, metadata allowlist snapshots and disabled-module config rejection.
- **Risks/notes:** Empty env still means all available modules; test core-only via an empty available registry, not a silent change to P0 env semantics.

### [x] P1.7a – Implement generic instance CRUD (est. 6 h)
- **Description:** Add registry-driven instance CRUD, config validation, initial/subsequent revisions and shared config-change classification. Domain logic stays behind ModuleDefinition hooks.
- **Files/packages:** core instance service, db instance/revision repositories, server generic routes.
- **Depends on:** P1.6b, P1.5a, P1.4c, P1.13a.
- **Reuses:** Registry schemas, tenant repositories, audit/events, error and pagination helpers.
- **Acceptance criteria:**
  - [x] Create/read/update/status/delete enforce unique keys, active project/module, role/scopes and monotonic config versions; destructive API changes require the same rights as config apply.
  - [x] Config/revision/audit/event writes share a transaction; deletion behavior uses approved retention/erasure rules and cannot bypass destructive checks.
- **Tests:** Synthetic modules through public service/HTTP interfaces; foreign IDs/keys, invalid config, concurrent update and forced rollback.
- **Risks/notes:** I7/I12/I19; no production domain routes solely to demonstrate generic CRUD.

### [x] P1.7b – Add revision reads, rollback and config migration (est. 4 h)
- **Description:** Expose bounded revision history/rollback; define deterministic module_version upgrades through migrateConfig and write a new revision when persisted.
- **Files/packages:** core instance versioning service, db revision queries, server revision routes.
- **Depends on:** P1.7a.
- **Reuses:** Instance mutation path and destructive-change classifier; never update historical revisions in place.
- **Acceptance criteria:**
  - [x] Rollback creates a new config_version and checks current permissions/destructive changes; a foreign revision cannot be applied.
  - [x] Unsupported future/old formats fail safely; repeated lazy migration is idempotent and no read silently mutates configuration without transactional audit/revision semantics.
- **Tests:** Old-config fixture migration, failed migration, rollback after schema changes and concurrent config update.
- **Risks/notes:** Define lazy read vs. persisted migration explicitly in the module ADR; background migration hooks are registered in P1.10b.

### [x] P1.7c – Plan config-as-code changes (est. 6 h)
- **Description:** Build registry-derived config documents and a pure diff/normalization planner, with strict project/module/config version validation and destructive warnings.
- **Files/packages:** core config-as-code schemas/planner, server GET/config dry-run route.
- **Depends on:** P1.7b; Q5 config contract refinements.
- **Reuses:** Module config schemas, instance services, scope policies and config-change classifier.
- **Acceptance criteria:**
  - [x] Read/dry-run require config:read; planning makes no writes. Config exports omit keys, recipients and personal records; config sections map to module resource names without hand-written per-module branches.
  - [x] Define planHash binding to organization/project, principal, normalized desired config, current versions, registry/schema versions and expiry; tampered/cross-tenant plans cannot be accepted.
- **Tests:** Property tests for deterministic ordering/no-op diffs, removed instances/fields and normalized equivalents; no side effects on dry run.
- **Risks/notes:** §D.8 lacks an explicit per-instance module_version serialization field; settle it in the module/config ADR, not a second hand-written config schema.

### [x] P1.7d – Apply config atomically and export schemas (est. 6 h)
- **Description:** Add planHash verification and apply under a project-level lock; expose registry-derived JSON Schema and types hook for later CLI use.
- **Files/packages:** core config apply service, db locking/repositories, server config/schema/types routes.
- **Depends on:** P1.7c.
- **Reuses:** Generic mutations, audit/events and same-transaction capabilities.
- **Acceptance criteria:**
  - [x] Missing/expired/stale/tampered plans fail without partial writes; concurrent plans from the same base cannot overwrite changes. Apply requires config:write and config:destructive when needed; session roles map explicitly.
  - [x] Disabled/omitted sections cannot silently delete data. Whole-document apply locks and rechecks state, creates revisions/audit/events atomically, and produces no revisions on a no-op.
- **Tests:** Concurrent apply, replay after state change, cross-principal/tenant reuse, injected mid-apply failure and fixture schema/types generation.
- **Risks/notes:** Recheck canonical plan under the write lock; never trust a client-supplied diff or destructive flag.

### [x] P1.8e – Implement private S3 storage (est. 6 h)
- **Description:** Add StorageAdapter and S3 implementation for signed PUT, safe GET, HEAD/COPY/DELETE/stream. Separate internal endpoint from browser-facing signing endpoint in validated config.
- **Files/packages:** core storage contract, `packages/adapters/src/storage/`, core config/`.env.example`, server composition/readiness.
- **Depends on:** P1.8d, P1.6b.
- **Reuses:** Garage compose/init/CORS, existing AWS SDK dependency, ADR-0020 settings.
- **Acceptance criteria:**
  - [x] PUT signs length/type; GET defaults to short-lived attachment/octet-stream. Endpoint split works from server containers and the host browser; no public ACLs or original names in object keys.
  - [x] Checksums use WHEN_REQUIRED as spiked; optional storage is not constructed/probed for storage-free installations.
- **Tests:** Garage signed size/type rejection, GET disposition/expiry, HEAD/COPY/DELETE/stream and server-vs-browser endpoint smoke; retain tests for P3.10 expansion.
- **Risks/notes:** No uploads API, scanner implementation or proxy upload mode here. Recheck the paired AWS patch before adoption.

### [ ] P1.9a – Add expiring proof-of-work challenges (est. 4 h)
- **Description:** Define the PoW provider boundary, ALTCHA implementation and rate-limited challenge endpoint with atomic replay protection.
- **Files/packages:** core abuse/captcha contracts, ALTCHA adapter, db replay repository, server public challenge route.
- **Depends on:** P1.8c, P1.6b, P1.4c.
- **Reuses:** `altcha-lib` spike settings, `clock`, APP_SECRET-derived purpose key and expiry tables.
- **Acceptance criteria:**
  - [ ] Signed challenges expire after the documented period and cannot be modified; replay claims use a unique atomic DB operation across workers.
  - [ ] Challenge generation is bounded/rate-limited, project-bound and public output contains no internal data; secret-key public operations skip PoW only with the operation scope.
- **Tests:** Tamper/expiry/wrong-secret/wrong-project cases, concurrent replay, fixed-clock difficulty checks and public response snapshot.
- **Risks/notes:** Tune difficulty with measured solve time and record it; no third-party captcha dependency.

### [ ] P1.9b – Compose AbuseGuard and public CORS (est. 6 h)
- **Description:** Implement §D.5's cheap-first pipeline with body/rate/origin checks, honeypot short circuit, PoW, strict validation, heuristics and quota hooks.
- **Files/packages:** core abuse pipeline, server public router/middleware, test-only public-write fixture.
- **Depends on:** P1.9a, P1.8d.
- **Reuses:** Shared limiter, IP identity, normalized origins, module config/schema and entitlements.
- **Acceptance criteria:**
  - [ ] Public write fixture proves ordering and size overrides; honeypot success persists nothing; schema errors are structured; heuristics return verdicts rather than dropping accepted data.
  - [ ] CORS reflects only permitted origins with correct Vary/preflight behavior and no credential reflection; management routes gain no CORS. Quota rejection occurs before persistence.
- **Tests:** Oversized/chunked bodies, denied/empty/null origins, honeypot, PoW skip scope, limiter/quota failures and full public response snapshots.
- **Risks/notes:** Real domain writes arrive P2–P4; fixture route must not be mounted in production.

### [ ] P1.9c – Add shared idempotent-write support (est. 4 h)
- **Description:** Implement tenant/project-bound request hashing, atomic idempotency claim/replay and safe response storage for public writes; expose through core, not module-specific copies.
- **Files/packages:** core idempotency contract/helper, db repository, public-write fixture.
- **Depends on:** P1.9b, P1.2b; Q8 retention.
- **Reuses:** Tenant transaction, canonicalization primitives where semantics match, expiry and response schemas.
- **Acceptance criteria:**
  - [ ] Same key/body replays the approved result; changed body conflicts; concurrent duplicates persist event/usage/data once. No in-flight/failed transaction leaves a successful replay record.
  - [ ] Cache is bounded by expiry and stores only allowlisted public response data, never input content or secret keys. Cross-project keys are independent.
- **Tests:** Real DB concurrent claim/rollback, request mismatch, expiry and no duplicate usage/outbox effects.
- **Risks/notes:** Central support prepares P2.4; route-specific idempotency policy stays in the module contract.

### [ ] P1.10a – Start pg-boss and transactional jobs (est. 4 h)
- **Description:** Replace the idle worker with a pg-boss queue adapter; register validated job payloads and queue handlers from enabled modules/core.
- **Files/packages:** core queue/job contracts, adapter, server worker/roles/shutdown wiring.
- **Depends on:** P1.6b, P1.8d.
- **Reuses:** Existing process lifecycle and shared pg driver/pool design; ADR-0020 transactional enqueue.
- **Acceptance criteria:**
  - [ ] Commit delivers jobs and rollback does not; worker/all roles consume only registered jobs with bounded concurrency/retries and safe error logs.
  - [ ] Graceful stop drains active work and closes queue/database resources in order; invalid job payloads cannot escape validation.
- **Tests:** Real Postgres enqueue/rollback/retry, fresh process role start/stop and disabled job registrations.
- **Risks/notes:** Verify pg-boss 12.38.1 on Bun; do not assume the Drizzle transaction is compatible without the adapter smoke test.

### [ ] P1.10b – Dispatch the outbox and retry mail (est. 4 h)
- **Description:** Dispatch pending events to registered consumers via transactional job enqueue; wire durable auth/security mail delivery and module retention/privacy/config-migration job hooks.
- **Files/packages:** outbox repositories/dispatcher, worker core handlers, auth mail integration.
- **Depends on:** P1.10a, P1.8a/b, P1.7d.
- **Reuses:** Events table, pg-boss transaction adapter, module job/event registry and Mailpit.
- **Acceptance criteria:**
  - [ ] Claim/enqueue/dispatched marker share a transaction; concurrent dispatchers cannot lose events. Stable consumer identities deduplicate retries with documented at-least-once semantics.
  - [ ] Rolled-back auth actions send nothing; committed invitations/exposure alerts retry after SMTP failure. Email recipient/token jobs use bounded retention and sanitized logging per Q8.
- **Tests:** Crash before/after enqueue, parallel dispatch, SMTP retry and failure recovery; module hooks tested with fixtures.
- **Risks/notes:** External SMTP delivery cannot be made exactly-once by a DB transaction; document possible duplicate delivery and limit repeat alerts.

### [ ] P1.10c – Add bounded cleanup schedules (est. 4 h)
- **Description:** Register replay/idempotency/rate-bucket cleanup (including email-verification `auth_token_replays`), audit retention and expired auth/job housekeeping, using the approved maintenance boundary.
- **Files/packages:** worker core schedules/handlers, db maintenance repositories.
- **Depends on:** P1.10b, P1.9c; Q8.
- **Reuses:** `clock`, expiry indexes, module retention hooks and pg-boss cron.
- **Acceptance criteria:**
  - [ ] Cleanup is batched/retryable, removes only expired rows and leaves current data intact; disabled modules' jobs do not run.
  - [ ] Audit purge enables its trigger override only transaction-locally through a restricted maintenance path; request handlers cannot use it. No application-wide append-only bypass.
- **Tests:** Fixed-clock boundary data, repeated/parallel cleanup, failed-purge rollback and job retention of personal auth mail payloads.
- **Risks/notes:** Module personal-record erasure is implemented with the domain modules; no fake GDPR endpoint with incomplete deletion.

### [ ] P1.11b – Generate contract types and the admin client (est. 4 h)
- **Description:** Export deterministic OpenAPI/TS types and add the MIT `@backbricks/sdk/admin` public entry point for the dashboard.
- **Files/packages:** server contract exporter, `packages/api-contract/`, `packages/sdk/`, root scripts, architecture fixtures.
- **Depends on:** P1.7d, P1.5b, P1.9b; Q5 (DEV-8).
- **Reuses:** Route schemas/manifest, openapi-typescript/openapi-fetch and ADR-0020 local TS fallback.
- **Acceptance criteria:**
  - [ ] `bun run api:generate` is reproducible without live DB/network services; generated files are committed, never hand-edited. Generating package resolves TS 5.9.3 locally; root typecheck stays TS 7.
  - [ ] Admin client imports AGPL contract types only, forwards session CSRF safely, never embeds secrets in generated output, and adds no dependency to the SDK root browser entry point.
- **Tests:** Repeat generation, type-level request/response checks, declared admin subpath architecture fixture and Node 20/Bun import smoke.
- **Risks/notes:** Better Auth's client is configured in web from its public library types; do not import the server auth instance for type inference. Resolve exports through public package entries.

### [ ] P1.11c – Enforce drift and breaking-change checks (est. 4 h)
- **Description:** Add `api:check` and an offline oasdiff compatibility gate against the PR base contract, including first-contract bootstrapping.
- **Files/packages:** root scripts/package pipelines, `mise.toml`, `.github/workflows/ci.yml`, contract fixtures.
- **Depends on:** P1.11b.
- **Reuses:** Existing CI checkout/test jobs and deterministic exporter; oasdiff 1.35.0.
- **Acceptance criteria:**
  - [ ] CI fails for uncommitted spec/type drift and breaking `/v1` changes; a committed regeneration does not bypass comparison to base. `api:breaking` uses the PR base in CI, local merge-base with `origin/main` otherwise. Missing Git history is an error; bootstrap only when the actual base commit has no contract.
  - [ ] Add to `bun run check`/pre-push consistently; tool pin is only in mise. Typed API routes get consistent 405 behavior without revealing protected resources.
- **Tests:** Fixture additive change passes, removal/type change fails, generated drift fails and missing-base behavior is explicit.
- **Risks/notes:** No hosted spec upload. Library auth routes are inventoried/tested separately; don't pretend they use the `/v1` OpenAPI contract.

### [ ] P1.12a – Build dashboard auth flows (est. 6 h)
- **Description:** Add login, signup, verification, reset and invitation-acceptance screens using the approved public Better Auth client and en/de translations.
- **Files/packages:** web routes/auth client/i18n, UI primitives added through shadcn CLI in `packages/ui` as needed.
- **Depends on:** P1.1c, P1.11b; Q6.
- **Reuses:** Existing TanStack Router/Query, shared theme/Card/Button, i18next and Happy DOM/Testing Library.
- **Acceptance criteria:**
  - [ ] All flows handle loading, expiry, errors and signup policy with accessible labels; redirect targets stay same-origin and signed-out users cannot view protected pages.
  - [ ] Verification/reset tokens do not enter analytics/logs or persistent client storage; no server-package imports or hand-written API payload types.
- **Tests:** Component behavior/translation parity and Playwright verification/reset via Mailpit; malicious redirect and invalid invitation cases.
- **Risks/notes:** React Hook Form/resolver patch verified with Zod 4. No M6 first-run setup UI.

### [ ] P1.12b – Build the shell, switchers and project settings (est. 6 h)
- **Description:** Add responsive authenticated navigation, org/project switchers, organization creation, project list/create and settings for names/domains.
- **Files/packages:** web layout/project routes/module nav registry, shared UI where reused.
- **Depends on:** P1.12a, P1.5a/b, P1.6b.
- **Reuses:** Generated admin client, Better Auth organization client, Query cache, existing i18n/theme.
- **Acceptance criteria:**
  - [ ] Switching tenants resets tenant-specific cached data; project routes handle no project, revoked membership and foreign deep links safely.
  - [ ] Navigation reflects operational module metadata; domain pages are absent until built. Settings validation uses the API contract, with human wording and explicit empty-origin warning.
- **Tests:** Org/project switch with separate fixtures and stale requests; mobile navigation, roles and origin settings.
- **Risks/notes:** No duplicate tenant selector state across screens; cache keys include organization/project.

### [ ] P1.12c – Build Embed/key management (est. 4 h)
- **Description:** Add key presets/create/reveal-once/revoke and allowed-domain integration guidance under Embed.
- **Files/packages:** web Embed routes, `packages/ui` KeyRevealDialog/confirmation primitives when shared.
- **Depends on:** P1.12b, P1.4b/c.
- **Reuses:** Generated client, shared scope/preset contract, role policy and project settings UI.
- **Acceptance criteria:**
  - [ ] Secret is shown only from creation response and cleared on close/navigation; it never enters persistent storage, query cache, URL or error reports.
  - [ ] Revocation refreshes metadata; members cannot manage keys. Preset descriptions explain access without exposing personal records.
- **Tests:** Reveal lifecycle, clipboard error, revoke confirmation, session expiry and no secret in caches/DOM after close.
- **Risks/notes:** M5's agent connection wizard/snippets are not built here.

### [ ] P1.12d – Build members and activity views (est. 4 h)
- **Description:** Add invitation, member-role/removal and paginated organization activity screens.
- **Files/packages:** web organization/member/activity routes, i18n, reused shared UI.
- **Depends on:** P1.12b, P1.1c, P1.5b.
- **Reuses:** Better Auth client, generated activity client, role policy and shared confirmation/error patterns.
- **Acceptance criteria:**
  - [ ] Owner/admin/member capabilities match server rules, last-owner errors are understandable, and approved no-SMTP invitation fallback is restricted to authorized users.
  - [ ] Key/member actions appear with safe audit fields; no secrets/personal payloads render in activity or translations.
- **Tests:** Role matrix, invite accept/expiry/resend/cancel and audit display after actions; translation key parity.
- **Risks/notes:** UI hiding is never the permission boundary; direct API tests remain mandatory.

### [ ] P1.13b – Complete the management isolation/security matrix (est. 4 h)
- **Description:** Audit runtime route coverage against every exposed management operation, including library routes, generated generic fixture routes and each credential kind.
- **Files/packages:** server isolation tests/fixtures, auth security tests, architecture fixtures.
- **Depends on:** All preceding API/worker tasks, P1.13a.
- **Reuses:** Automatic suite and route metadata; no parallel manually maintained list as the source of truth.
- **Acceptance criteria:**
  - [ ] Coverage is 100% for registered/exposed management methods; missing declaration/fixture fails. Test foreign orgs, project-bound keys against sibling projects, mismatched nested resource IDs, roles, scopes, revocation and denied-write side effects. Organization-wide sessions may legitimately access both own-org projects.
  - [ ] Public snapshot coverage proves no private fields; key/member/config actions prove atomic audit; unmounted test routes and raw auth bypasses are checked.
- **Tests:** `CI=true bunx turbo run test --force` with compose services; full matrix must run fresh with zero service-related skips.
- **Risks/notes:** Collection/list/create semantics use P1.13a's non-disclosure assertions; never weaken foreign-resource 404 to match a library default.

### [ ] P1.13c – Demonstrate M1 and record the handoff (est. 6 h)
- **Description:** Complete Playwright owner workflow, run every acceptance command fresh and write the phase report with evidence, deviations and unresolved gaps.
- **Files/packages:** `e2e/`, `docs/progress/phase-1.md`, PLAN checkboxes and relevant run guides.
- **Depends on:** P1.12a–d, P1.13b, P1.11c, P1.10c.
- **Reuses:** Existing E2E server/build setup and P0 report format; Mailpit test helpers from auth tasks.
- **Acceptance criteria:**
  - [ ] Signup → verified account → org → project → key → invitation/acceptance works end to end; key/member audit visible, key revoke enforced and foreign tenant denied.
  - [ ] Fresh check/build/E2E/isolation/drift/image commands pass with real services; report records exact commands/counts and identifies any remaining limitation. No skipped integration result is claimed as milestone proof.
- **Tests:** Playwright en/de owner journey, second-browser invited member and foreign-origin secret rejection; full acceptance below.
- **Risks/notes:** A different fresh session can review M1 per AGENTS §9. Maintainer pushes/opens PR; CI proof is required before M1 is declared accepted.

### Phase acceptance

Commands are the intended post-implementation interface; `api:*` scripts are created in P1.11. Run after `mise install && mise run infra`, using isolated test tenants/database and Mailpit. M1 E2E setup applies migrations and sets `SIGNUP_POLICY=open` explicitly (Q6); production defaults remain separately tested. Bring up Docker before recording integration evidence.

- [ ] **Owner workflow:** `bun run build && bun run test:e2e` proves signup/verification → org → project → key → invite/accept, including en/de and separate users.
- [ ] **100% management isolation:** `CI=true bunx turbo run test --force` runs the automatic route-policy/isolation suites, auth plugin coverage and all real DB/adapter tests with no service-related skips; `bun run test:scripts` runs architecture fixtures. New endpoints without policy/fixture fail.
- [ ] **Visible audit:** the E2E command shows key create/revoke and invitation/member role actions in Activity; DB tests prove mutation/audit rollback together.
- [ ] **Foreign-origin secret:** server tests and E2E assert `403 secret_key_exposed`, committed safe audit, notification intent, and no business mutation. No raw key appears in logs/audit/events.
- [ ] **Contract CI:** `bun run api:generate && bun run api:check` leaves no generated diff; `bun run api:breaking` compares the PR base spec with the working spec using pinned oasdiff. CI runs both and a negative fixture proves the gates reject drift/breaking changes.
- [ ] **Full quality:** `bun run check && bun run build` green; fresh tests above avoid cached service availability. `docker build -t backbricks/server:m1 .` plus the CI image smoke runs migrate/serve/worker and serves dashboard/health (extend P0's smoke to cover the now-functional worker).
- [ ] **Optionality:** registry test matrix passes core-only and all synthetic subsets; disabled modules have no routes/jobs and storage-free cases boot without S3/scanner configuration. M1 contains no production domain implementation.
- [ ] **Report and review:** `docs/progress/phase-1.md` records evidence, accepted ADRs and known gaps; all tasks checked, human-reviewed signed-off commits, green CI on maintainer-created PR. No push is implied by phase execution.

### Planning risks and sources

- Auth audit atomicity/raw organization endpoints (P1.1a) and the repository/capability transaction seam (P1.3a) are the critical path. A failed proof changes the design/estimate before dependent code, never I1/I12.
- The original 12–15 PD allowance did not break out the dashboard flows, concurrency/rollback tests, schema/codegen boundaries and full route coverage. Keep the detailed estimate visible; do not hide overruns by skipping those criteria.
- Planning baseline: P0 CI green on PR #4; local check in the onboarding session passed with Turbo cache and Garage skips. Docker was unavailable then. This is not fresh integration acceptance for M1.
- Versioned primary references to inspect at implementation time: [Better Auth Drizzle adapter](https://better-auth.com/docs/adapters/drizzle), [organization hooks/endpoints](https://better-auth.com/docs/plugins/organization), [database/schema generation](https://better-auth.com/docs/concepts/database), [oasdiff CLI](https://www.oasdiff.com/docs/getting-started), [oasdiff 1.35.0 release](https://github.com/oasdiff/oasdiff/releases/tag/v1.35.0). Current docs may differ from pinned runtime; installed source/types and a real DB test decide compatibility.

### Execution notes

P1.8e complete; see ADR-0044 and its task commit. Next: P1.9a (PoW provider/replay/challenge). Public publishable-key bootstrap awaits an explicit I1 clarification; provider/replay work can proceed independently. M1 remains in progress.

## Phase P2 – Forms (M2 · v0.1.0) · stub

**Goal:** The first module end to end. **Estimate:** 9–11 PD.

**Release gate from Q7 / ADR-0030:** Define and implement personal-data hard erasure separately from project configuration archive before the M2 release, including DB records, objects, queued jobs and retained audit lifecycle.

- [ ] P2.1 – `packages/modules/forms`: config schema (field types and rules per §D.8, honeypot, PoW, HTML redirects, `retentionDays`, `identifiesSubject`), templates (contact, quote request, job application, event sign-up), `validateConfigChange` (field removed / type changed = destructive)
- [ ] P2.2 – Runtime validator: config → Zod; normalization (trim, lowercase email); unknown fields rejected; field errors as problem details
- [ ] P2.3 – Table `form_submissions` + migration; `search_vector` on insert; `expires_at`; `subject_email`; replace its SQL in §B.3 with a link
- [ ] P2.4 – Public: `GET /v1/public/forms/{key}` and `POST …/submissions` (JSON + urlencoded with 303 redirect), `Idempotency-Key`, AbuseGuard, spam verdict, event `forms.submission.created`, usage counter; secret-key variant with `forms:submit` without PoW
- [ ] P2.5 – Admin: submissions list (cursor, filters status/read/spam/date, full-text search), detail (rendered with field definitions of the stored `config_version`), patch (status, read, spam), delete, bulk (mark, delete), streamed CSV export (union of fields, CSV-injection safe, owner/admin, audited)
- [ ] P2.6 – Notification rules (CRUD) and sending on new submissions: content-free by default, `include_content` opt-in, throttling (max N/h per rule, then digest)
- [ ] P2.7 – Retention: daily purge job (entries + spam after 30 days), `expires_at` recomputation on retention change; `privacy` handler (export/erase by email)
- [ ] P2.8 – Dashboard "Inbox": form list (counts, unread), tabs Entries (DataTable + RecordDrawer + spam folder), Fields (FieldListEditor with templates, up/down, no logic rules), Settings (spam, notifications, retention), Embed (HTML/fetch/SDK snippets)
- [ ] P2.9 – Minimal `@backbricks/sdk` with `forms.submit` + PoW solving; `examples/html` (plain HTML form without JS **and** fetch variant)
- [ ] P2.10 – Release `v0.1.0` developer preview: changelog, Docker image tag, README quickstart for the dev setup

## Phase P3 – Uploads (M3 · v0.2.0) · stub

**Goal:** Safe direct uploads with scanning and linking. **Estimate:** 9–12 PD.

- [ ] P3.1 – Upload zone config: type presets (images, PDF, office) as allowlist of MIME + extension, `maxSizeMb` (≤ 100), `retentionDays`, scan required
- [ ] P3.2 – Table `files` + migration; key scheme `stg/{org}/{prj}/{fileId}` and `fil/{org}/{prj}/{fileId}`; replace its SQL in §B.3 with a link
- [ ] P3.3 – Public: intent → presigned PUT (5 min, content length and type signed) + `uploadToken`; `complete` → HEAD check → `uploaded` → scan job
- [ ] P3.4 – Scan job: COPY to final key, delete staging, magic-byte detection (`file-type`), allowlist re-check, SHA-256, ClamAV `INSTREAM` adapter (`SCANNER=none|clamav`), statuses `ready/quarantined/rejected`, retries, events, admin notification on quarantine
- [ ] P3.5 – `files` capability (`claim`, `listByOwner`, `deleteByOwner`) with checks (project, zone, token, status, single use, `maxFiles`); forms field type `file` uses it in the same transaction; deleting a submission deletes its files
- [ ] P3.6 – Admin: zones (generic), file list (zone/status/date filters, name search), detail, `POST …/download-url` (60 s, attachment, audited), single/bulk delete (object + row), storage usage
- [ ] P3.7 – Jobs: orphan cleanup (pending or unclaimed > 24 h), retention purge, `privacy` handler
- [ ] P3.8 – Dashboard "Files": table/grid with safe previews, status badges incl. "not scanned", download, multi-select + ConfirmDialog, storage meter; attachments in the forms RecordDrawer
- [ ] P3.9 – SDK `uploads.upload(file, { zone, onProgress, signal })`; example extended with CV upload
- [ ] P3.10 – Storage contract suite (presign with signed length, COPY, HEAD, DELETE, CORS preflight) against Garage in CI and optionally a real provider via env

## Phase P4 – Reviews (M4 · v0.3.0) · stub

**Goal:** Collect, moderate, publish. **Estimate:** 5–7 PD.

- [ ] P4.1 – Collection config: scale (default 5, max 10), required title/body/email, public extra fields, length limits, `moderation: manual` (default), author name display format, optional "verification method" text
- [ ] P4.2 – Table `reviews` + migration; replace its SQL in §B.3 with a link
- [ ] P4.3 – Public: submit (AbuseGuard), list of published reviews (cursor, sort, `limit ≤ 50`), stats (count, average, distribution); `Cache-Control` + `ETag`/`304`; response serializer with an allowlist of fields
- [ ] P4.4 – Admin: list/filter by moderation status, approve/reject, publish/unpublish, delete, stats; no content editing
- [ ] P4.5 – Dashboard "Reviews": queue with keyboard shortcuts, tabs published/rejected, stat cards, embed; hint box about legal transparency duties (marked "please verify legally")
- [ ] P4.6 – SDK `reviews.list`, `reviews.stats`, `reviews.submit`; example extended

## Phase P5 – Agent-ready (M5 · v0.4.0) · stub

**Goal:** Scenario A (ARCHITECTURE §D.10) without human help. **Estimate:** 12–15 PD.

- [ ] P5.1 – SDK complete: `createClient`, `BackbricksError` (`code`, `fieldErrors`, `requestId`), retries for idempotent calls only, lazy PoW web worker (`@backbricks/sdk/pow`), generic `request()`, module augmentation for codegen types, size budget (< 8 KB gz) in CI; tests on Node and Bun
- [ ] P5.2 – `@backbricks/sdk/admin`: generated management client (`openapi-fetch`), adopted by the dashboard (see DEV-8)
- [ ] P5.3 – CLI foundation (`packages/cli`): command framework, `--json`, `--yes`, documented exit codes, credentials (file 0600 or `BACKBRICKS_SECRET_KEY`), JSON Schema for `backbricks.config.json`; bundled with `bun build --target=node`
- [ ] P5.4 – CLI commands `login`, `init` (framework detection for env var names, `.gitignore`, optional `AGENTS.md` section), `pull`, `diff`, `push` (two-step with `planHash`, `--allow-destructive`), `validate`, `codegen`, `test submit`, `keys list`, `docs`
- [ ] P5.5 – `backbricks doctor`: connectivity, origins, key validity, scan for `bb_sk_` in public env prefixes and build output
- [ ] P5.6 – `backbricks mcp`: stdio MCP server with the tools from §D.9, per-tool scope checks, no delete tools, plan/apply enforced, audit `actor_type='mcp'`
- [ ] P5.7 – Agent docs: `skills/backbricks/SKILL.md`, `llms.txt`/`llms-full.txt`, quickstarts (Next.js, Astro, Vue, HTML), generated error-code reference, Scalar API reference; docs site with Astro Starlight at `/docs` inside `apps/www` (ADR-0001), plus `/errors/*` and `/schema/*` pages
- [ ] P5.8 – Examples: `examples/nextjs` (App Router, custom UI, contact + CV upload + reviews, variant with server action and secret key on the server), `examples/astro`, complete `examples/html`
- [ ] P5.9 – Dashboard wizard "Connect an AI agent": preset key + copyable prompt block for Claude Code/Codex
- [ ] P5.10 – Scenario A E2E: script `init → extend config → push → codegen → build example → Playwright submits form/upload/review → admin API verifies`

## Phase P6 – Open Source 1.0 (M6 · v1.0.0) · stub

**Goal:** Scenario C and a publishable OSS project. **Estimate:** 6–8 PD.

- [ ] P6.1 – `deploy/compose/`: production compose (app, worker, migrate one-shot, postgres, garage + init behind profile `storage`, caddy, clamav profile `scan`, backup profile), health checks, volumes, `.env.example`, Caddyfile; `configure` step in the setup CLI that asks for modules and writes `BACKBRICKS_MODULES` + matching `COMPOSE_PROFILES` (§C.7)
- [ ] P6.2 – First-run setup wizard (instance admin, `SIGNUP_POLICY` default `invite_only`), `system_settings`; adds the `setup` role (DEV-7)
- [ ] P6.3 – `UPLOAD_MODE=proxy` (streaming through the app with hard limit) for setups without publicly reachable storage
- [ ] P6.4 – Backup container (`pg_dump` + `restic`), restore guide, CI job dump → restore → smoke
- [ ] P6.5 – Upgrade path: semver tags, automatic migrations, Changesets-based `CHANGELOG.md`, upgrade guide, lazy config migration job (`module_version`)
- [ ] P6.6 – Hardening: security headers + strict CSP, login rate limits, `bun audit`, non-root/read-only containers, threat model (STRIDE) in `docs/security/`, verify `SECURITY.md` process; re-evaluate a distroless base image (OPEN_QUESTIONS D1)
- [ ] P6.7 – Release engineering: SPDX headers in all source files, license check of dependencies (no AGPL-incompatible deps; MIT packages free of copyleft deps), README with quickstart, GHCR image release, npm publish (`@backbricks/sdk`, `backbricks`) with provenance, legal review of `LICENSING.md`/`TRADEMARKS.md` noted in `OPEN_QUESTIONS.md`
- [ ] P6.8 – Scenario C test in CI: fresh runner, `docker compose up` from `deploy/compose`, setup via API, smoke test of all three modules; plus minimal-footprint runs (forms only: app + postgres; uploads only: without ClamAV)

## Phases C1–C3 – Managed cloud (after M6) · coarse

**Estimate:** C1 7–9 PD, C2 5–7 PD, C3 3–5 PD. Planned in detail only after M6. Technical and legal background: [`docs/CLOUD.md`](docs/CLOUD.md).

- [ ] C1.1 – `DEPLOYMENT_MODE=cloud`: open sign-up with mandatory verification, onboarding (org → project → template → embed), disposable-email check
- [ ] C1.2 – `cloud/` package: plans as config, `PlanEntitlements`, enforcement per CLOUD.md §2, usage page
- [ ] C1.3 – Metering jobs: storage gauge, download bytes, monthly close
- [ ] C1.4 – RLS on all tenant tables, app role without `BYPASSRLS`, dedicated role for cross-tenant jobs, tests (CLOUD.md §1)
- [ ] C1.5 – Infrastructure on Hetzner (DE) per CLOUD.md §4 (OpenTofu or scripted), Postgres with pgBackRest/WAL-G (PITR, offsite), object storage, Caddy, deploy pipeline
- [ ] C2.1 – Billing adapter (provider per `OPEN_QUESTIONS.md`): checkout, portal, webhooks → plan
- [ ] C2.2 – Ops: uptime monitoring, logs, EU error tracking, alerting; runbooks (incident, breach/72 h, key rotation, restore) in `docs/ops/`
- [ ] C2.3 – Restore drill recorded; k6 load test of the public API with documented limits
- [ ] C2.4 – Legal drafts (external review): DPA, TOMs, sub-processor list, privacy policy, imprint, terms; closed beta
- [ ] C3.1 – Legal sign-off, status page, public launch
- [ ] C3.2 – Optional: remote MCP `/mcp` (Streamable HTTP) with OAuth 2.1 via Better Auth OAuth provider (CLOUD.md §6)
- [ ] C3.3 – Scenario D E2E on production

## Risk register

| # | Risk | Phase | Mitigation | Status |
|---|---|---|---|---|
| R1 | TS 7 has no JS compiler API; dependency-cruiser, openapi-typescript and the Better Auth CLI may fail | P0.2, P0.9b, P1.11 | Tool-local fallbacks work (swc parser, TS 5.9.3 in api-contract); TS 7 stays (ADR-0020) | resolved |
| R2 | Bun's isolated linker + bind mount: per-package `node_modules`, darwin vs. Linux binaries | P0.3b | Named volume per workspace, in-container install (`deps`), volume sync test | open |
| R3 | Garage image has no shell; admin API v2 details | P0.3a | Bun init script, pinned v2.5.0, idempotency test | open |
| R4 | Better Auth (`auth` CLI) and pg-boss declare `node >=22.12`; runtime issues on Bun | P0.9a | Both work on Bun 1.4.4 (ADR-0020) | resolved |
| R5 | Drizzle 1.0 RC: breaking changes between RCs or before GA | P0.6, P1.1 | Exact RC pin (Q1); spike in P0.9a; changelog review before upgrades; fallback 0.45.4 possible until the first real migration | open |
| R6 | P0 over budget (~1 PD), tooling overhead (ARCHITECTURE J.1 #10) | P0 | DEV-4/DEV-7 keep P1 work out of P0; spike is time-boxed | open |
| R7 | ClamAV: arm64 only in `-debian` images; 1.5–2 GB RAM | P0.3a, P3 | `-debian` tag, profile `scan` | open |
| R8 | File watching across the macOS bind mount | P0.3b | Polling options, documented | open |
| R9 | Garage may not enforce signed `Content-Length` on presigned PUTs | P0.9b, P3 | Enforced (403 on mismatch); needs the checksum setting (ADR-0020); P3.10 keeps it under test | resolved |
