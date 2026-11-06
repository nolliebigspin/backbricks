# PLAN – Backbricks

> The only task list. Milestones, scope and exit criteria: [`docs/MILESTONES.md`](docs/MILESTONES.md). Decisions for the maintainer: [`OPEN_QUESTIONS.md`](OPEN_QUESTIONS.md). Key decisions: [`docs/adr/`](docs/adr/). How phases are planned and executed: `AGENTS.md` §9.
> **State:** P0 done (report: [`docs/progress/phase-0.md`](docs/progress/phase-0.md)). P1–P6 and C1–C3 are stubs with task IDs; refine each phase into tasks in the format below before executing it.

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

- **Total estimate:** P0 **47 h ≈ 5.9 PD** (detailed). P1–P6 use the MILESTONES.md ranges until refined: 53–68 PD. **OSS track ≈ 59–74 PD.** Cloud track (C1–C3) **15–21 PD**.
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

Checked 2026-11-04 with `npm view <pkg> version` / `dist-tags` and the Docker Hub API. Pin exactly when adding.

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
| | react-hook-form / @hookform/resolvers | 7.91.0 / 7.0.2 | yes | P1.12 |
| Tests | @playwright/test | 1.64.1 | Node via mise | |
| | fast-check | 4.10.2 | yes | |
| | happy-dom / @happy-dom/global-registrator | 21.0.4 | yes | in repo |
| | @testing-library/react | 16.3.3 | yes | in repo |
| Spiked in P0.9, used later | better-auth / `auth` CLI | 1.7.17 / 1.7.16 | yes, with notes (ADR-0020) | CLI via `bun run auth` (`bun auth` is reserved); generated schema needs `drizzle-orm/_relations` import with Drizzle 1.0 |
| | pg-boss | 12.38.0 | yes (ADR-0020) | `fromDrizzle(tx, sql)` enqueues inside Drizzle transactions |
| | @aws-sdk/client-s3 / s3-request-presigner | 3.1161.0 | yes, with setting (ADR-0020) | Garage enforces signed length/type; needs `requestChecksumCalculation: 'WHEN_REQUIRED'` |
| | altcha-lib | 2.8.0 | yes (ADR-0020) | v2 API with `altcha-lib/algorithms/sha` |
| | @modelcontextprotocol/sdk | 1.32.2 | yes, Bun and Node 24 (ADR-0020) | must also run on Node ≥ 20 (I18) |
| | nodemailer | 10.3.1 | to verify (P1.8) | |
| | file-type | 22.3.0 | to verify (P3.4) | |
| | @hono/zod-openapi | 1.6.3 | yes | peer zod ^4, hono ≥4.10 |
| | openapi-typescript | 7.13.0 | yes, with fallback (ADR-0020) | fails on TS 7; works with `typescript@5.9.3` local to `api-contract` |
| | openapi-fetch | 0.17.0 | yes | |
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
- [ ] **DEV-8 (affects P1; decide when planning P1): Generate the admin client in P1.11.** The P1.12 dashboard shell needs a typed management client, but `@backbricks/sdk/admin` only arrives in P5.2. Without a change, P1.12 would hand-write fetch calls or types (against AGENTS.md §2.2). Proposal: generate the `openapi-fetch` client together with the contract in P1.11; P5.2 then only packages and documents it.

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
- [ ] **Open:** CI green on a PR against `main` (needs a push by the maintainer)

## Phase P1 – Platform Core (M1) · stub

**Goal:** A multi-tenant platform with every contract in place, no domain modules yet. **Estimate:** 12–15 PD. Decide DEV-8 when planning.

- [ ] P1.1 – Better Auth in `packages/auth`: email/password, email verification, password reset, organization plugin with roles `owner/admin/member`, invitations via the mailer; mounted at `/api/auth/*`; cookie flags per ARCHITECTURE §F.1; Better Auth tables committed in the migration history. ADR-0020: generate with `bun run auth generate`, rewrite the `relations` import to `drizzle-orm/_relations`, set `telemetry: { enabled: false }`
- [ ] P1.2 – Core schema per §B.3 (without module tables) incl. audit trigger; generate and review the migration; replace the core SQL in §B.3 with a link to the schema
- [ ] P1.3 – `TenantContext` + auth middleware: principal from session, secret key or publishable key; `requireRole` / `requireScope`; route declaration requirement (I3) with test
- [ ] P1.4 – API keys: generation (`bb_pk_` / `bb_sk_` + 32 chars base62 from CSPRNG), hash storage, display prefix, scopes and presets per §D.1, revocation, throttled `last_used_at`, secret-key exposure detection (I6)
- [ ] P1.5 – Projects API (CRUD, validated `allowed_origins`, soft delete) and organization endpoints for the dashboard
- [ ] P1.6 – Module contract `ModuleDefinition` + `defineRegistry` (checks per §C.2), capability mechanism (`requires`/`optional`), `infrastructure` declarations, module enablement via `BACKBRICKS_MODULES` with startup validation, `module_not_enabled` responses and `GET /v1/meta` (§C.7), mount conventions for public/admin routes; tests that boot the app with every single-module subset
- [ ] P1.7 – Generic instance service + routes: CRUD with config validation, revisions, rollback, audit, event; config-as-code `GET/PUT /v1/projects/{id}/config` with `dryRun`, diff, destructive-change detection (`validateConfigChange`) and `planHash`; JSON Schema export
- [ ] P1.8 – Services and adapters: AuditService, EventService (outbox), Mailer (SMTP, TS templates with escaping), `StorageAdapter` + S3 adapter (presign PUT with signed length/type, presign GET with disposition, HEAD, COPY, DELETE, stream; separate internal and browser-facing endpoints, see phase-0 report), RateLimiter (Postgres + memory), UsageMeter, Entitlements (`unlimited`), Clock, Ids. ADR-0020: S3 client with `requestChecksumCalculation: 'WHEN_REQUIRED'`
- [ ] P1.9 – AbuseGuard pipeline per §D.5: body limits, rate limits, origin check, honeypot, PoW (ALTCHA protocol via `altcha-lib`, replay protection), heuristics hooks, quota hook; `GET /v1/public/challenge`; CORS for public routes
- [ ] P1.10 – Worker: pg-boss setup, job registry from modules, outbox dispatcher, cron jobs (PoW replay, idempotency and rate-limit cleanup), graceful shutdown. ADR-0020: `fromDrizzle(tx, sql)` for transactional enqueue
- [ ] P1.11 – OpenAPI pipeline: `@hono/zod-openapi`, `/v1/openapi.json`, export to `packages/api-contract`, TS types via `openapi-typescript`, `bun run api:check` drift check in CI, breaking-change check (`oasdiff`). ADR-0020: `typescript@5.9.3` as devDependency of `api-contract`
- [ ] P1.12 – Dashboard shell: login, sign-up, verification, password reset, accept invitation; org and project switcher; navigation from the web module registry; pages: projects, project settings (name, domains), Embed (create key with preset / reveal once / revoke), members (invite, roles), activity log
- [ ] P1.13 – Tenant isolation suite: fixtures 2 orgs × 2 projects × roles; automatic iteration over all registered management routes (foreign credentials → 404); part of `bun run test`

## Phase P2 – Forms (M2 · v0.1.0) · stub

**Goal:** The first module end to end. **Estimate:** 9–11 PD.

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
