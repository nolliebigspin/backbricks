# Planning & Execution Prompt – Backbricks

> **How to use this file**
>
> 1. Run `mise install && mise run setup` once in the repo.
> 2. **Session 1 (planning run):** in Claude Code run `/plan`, or give any agent the block between `<<<PROMPT` and `PROMPT>>>`. Result: `PLAN.md`, ADRs and `OPEN_QUESTIONS.md`, with no application code.
> 3. Review `PLAN.md`, answer the open questions (directly in `OPEN_QUESTIONS.md`), approve the plan.
> 4. **Following sessions (execution runs):** one fresh session per phase: `/phase P0`, `/phase P1`, … The agent stops after each phase with a report.
> 5. Optional after each phase: `/review P<N>` in a fresh session (independent reviewer without implementation context).
> 6. Other agents (Codex, Cursor): paste the content of the matching file in `.claude/commands/` instead of the slash command.

---

<<<PROMPT

# Role

You are a staff engineer, security engineer and open-source maintainer in one person. You plan and implement **Backbricks**, an open-source, self-hostable headless platform that gives websites backend features (forms, file uploads, reviews). AI coding agents integrate it via API, SDK, CLI and MCP, and non-technical site owners manage it in a dashboard. A managed EU cloud follows after the open-source 1.0.

You work for an experienced solo developer (TypeScript, React, Next.js, Tailwind). Prefer small, elegant, maintainable and secure solutions. Avoid enterprise over-engineering. **Open-source milestones M0–M6 have priority; the cloud milestones C1–C3 come later.**

# Sources of truth (in this order)

1. `CLAUDE.md`: engineering rules and **invariants I1–I19** (non-negotiable)
2. `docs/ARCHITECTURE.md`: decisions, data model, API design, stack, roadmap
3. `docs/MILESTONES.md`: milestone scope, exit criteria, release versions
4. `docs/adr/*.md`: recorded deviations and refinements
5. `PLAN.md`: detailed tasks (after approval)
6. Current official documentation of the libraries used

Read `CLAUDE.md`, `docs/ARCHITECTURE.md` and `docs/MILESTONES.md` **completely** before planning or writing anything.

# Modes

## Mode A: planning run

Write **no application code**. Produce:

1. **`PLAN.md`** in the format below. Refine phases P0–P6 (and C1–C3 at a coarser level) into concrete, independently implementable tasks (guideline: 2–6 hours each). Keep the task IDs from this prompt; sub-tasks get suffixes (`P1.3a`). Map every phase to its milestone.
2. **`docs/adr/0001-….md` to `docs/adr/00NN-….md`**: one short ADR (context, decision, consequences, alternatives) per row of the key decisions table in `docs/ARCHITECTURE.md` §0. Use `docs/adr/0000-template.md`.
3. **`OPEN_QUESTIONS.md`**: decisions the human must make, each with your recommendation and the latest task ID by which an answer is needed.
4. **"Proposed deviations"** section in `PLAN.md`: weaknesses, contradictions or gaps you find in the architecture, with reasoning. Don't change the architecture silently.
5. **Version list** in `PLAN.md`: current stable versions of all core dependencies, checked with `bun pm view <pkg> version` / `npm view`, not from memory. Flag any library with known Bun incompatibilities and propose a fallback.

End the session with a summary: number of tasks per phase, total estimate, the three biggest risks, the open questions.

## Mode B: execution run

- Implement **exactly one phase** (or the explicitly given task range).
- Work through the tasks in `PLAN.md` order. Per task: explore existing code with the code graph → implement → tests → `bun run check` green → tick the checkbox in `PLAN.md` → signed-off commit (`git commit -s`, Conventional Commits with task ID).
- Before using a library API, read its current types/docs (Bun, Better Auth, Drizzle, Hono, pg-boss, MCP SDK, AWS SDK, oxlint). Don't guess signatures.
- Missing decision not covered by the architecture: choose the simplest option that satisfies all invariants, record an ADR, add it to `OPEN_QUESTIONS.md` under "Decided, please confirm". Don't block.
- A decision would contradict an invariant or a key decision (`docs/ARCHITECTURE.md` §0/§J.2): **stop** and ask.
- At the end of the phase: **demonstrate** every acceptance criterion (run commands, summarize output), write `docs/progress/phase-N.md` (done, deviations, known gaps, new risks, evidence), then **stop** and wait for approval.

# Already in place (do not recreate, extend)

The repository was bootstrapped with: `mise.toml` (tools + tasks), root `package.json` (Bun workspaces, scripts), `turbo.json`, `tsconfig.base.json`, `.oxlintrc.json`, `.oxfmtrc.json`, `lefthook.yml` (pre-push), `.github/workflows/ci.yml` (PRs against `main`, DCO check), Dependabot, issue/PR templates, `.mcp.json` + `.claude/settings.json` (CodeGraph), `.claude/commands/`, license files (`LICENSE` AGPL-3.0, `LICENSING.md`, `TRADEMARKS.md`), `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `CLAUDE.md`, `AGENTS.md`, docs. P0 builds on these files and adjusts them where needed (e.g. CI steps once packages exist).

# Phase plan

Effort in person-days (PD); refine to hours per task in `PLAN.md`.

## P0 – Foundation (4–5 PD) → M0

| ID | Task |
|---|---|
| P0.1 | Workspace packages per `docs/ARCHITECTURE.md` §G.1 (`apps/server`, `apps/web`, `packages/{core,db,auth,adapters,api-contract,sdk,cli,ui,tsconfig}`, `packages/modules/*` as empty shells with `package.json`, `tsconfig.json`, `src/index.ts`); per-package `LICENSE` files for MIT packages; Turborepo tasks per package (`build`, `typecheck`, `test`, `dev`) |
| P0.2 | Architecture rules: dependency-cruiser config (`modules/*` → only `core`; `core` → nothing internal; `sdk`/`cli` → only `api-contract`; no deep imports); `bun run lint:arch`; oxlint rule set completed (incl. `react/no-danger`, `no-restricted-imports` for `process.env` outside config); wire into `check`, CI and pre-push |
| P0.3 | **Dev environment in Docker Compose** (`compose.yaml` at repo root): `postgres:18`, `garage` + one-shot `garage-init` (bucket, fixed dev key, CORS), `mailpit`, `clamav` (profile `scan`); storage services behind profile `storage` so a module subset can run without them; app services `server`, `worker`, `web` from one dev Dockerfile (`oven/bun`), source bind-mounted, `node_modules` in named volumes, `bun --watch` / Vite HMR; health checks and `depends_on` conditions; `.env.example`. `mise run dev` / `mise run infra` work. CI test job uses the same file |
| P0.4 | `packages/core/config`: Zod-validated env config, `*_FILE` support, readable error output, exit on invalid config; documented `.env.example`. The schema is composed from a base part plus the infrastructure parts of the enabled modules (`BACKBRICKS_MODULES`, §C.7), so e.g. S3 variables are only required when needed |
| P0.5 | `apps/server`: Hono on `Bun.serve`, `/healthz`, `/readyz` (DB + storage), pino with request ID and redaction, global error handler (RFC 9457), entry `serve \| worker \| all \| migrate \| setup` (`all` = serve + worker in one process) |
| P0.6 | `packages/db`: Drizzle (`pg` driver), migration runner with advisory lock (`bun run db:migrate`), TypeID helper, `withTenant` skeleton (`SET LOCAL app.org_id/app.project_id`) |
| P0.7 | `apps/web`: Vite + React 19 + TS, Tailwind v4, shadcn/ui initialized in `packages/ui`, TanStack Router + Query, i18next (en/de). Production build served statically by `serve` (SPA fallback) |
| P0.8 | Production Dockerfile (multi-stage, `oven/bun` base, non-root, read-only-FS friendly, one image for all roles); CI extended: build + Docker image build; Playwright scaffold (`bun run test:e2e`, Node via mise) |
| P0.9 | Library spike: verify Better Auth, pg-boss, Drizzle, AWS SDK S3 presigner, `altcha-lib`, MCP SDK and oxlint type-aware mode on Bun + TS 7; record findings and fallbacks in an ADR |

**Acceptance (M0):** `mise run setup && mise run dev` starts infra, server, worker and dashboard; `bun run check` green; the Docker image serves `/healthz` and the dashboard; CI green on a PR against `main`; pre-push hook runs.

## P1 – Platform Core (12–15 PD) → M1

| ID | Task |
|---|---|
| P1.1 | Better Auth in `packages/auth`: email/password, email verification, password reset, organization plugin with roles `owner/admin/member`, invitations via the mailer; mounted at `/api/auth/*`; cookie flags per `docs/ARCHITECTURE.md` §F.1; Better Auth tables committed in the migration history |
| P1.2 | Core schema per §B.3 (without module tables) incl. audit trigger; generate and review migration |
| P1.3 | `TenantContext` + auth middleware: principal from session, secret key or publishable key; `requireRole` / `requireScope`; route declaration requirement (I3) with test |
| P1.4 | API keys: generation (`bb_pk_` / `bb_sk_` + 32 chars base62 from CSPRNG), hash storage, display prefix, scopes and presets per §D.1, revocation, throttled `last_used_at`, secret-key exposure detection (I6) |
| P1.5 | Projects API (CRUD, validated `allowed_origins`, soft delete) and organization endpoints for the dashboard |
| P1.6 | Module contract `ModuleDefinition` + `defineRegistry` (checks per §C.2), capability mechanism (`requires`/`optional`), `infrastructure` declarations, module enablement via `BACKBRICKS_MODULES` with startup validation, `module_not_enabled` responses and `GET /v1/meta` (§C.7), mount conventions for public/admin routes; tests that boot the app with every single-module subset |
| P1.7 | Generic instance service + routes: CRUD with config validation, revisions, rollback, audit, event; config-as-code `GET/PUT /v1/projects/{id}/config` with `dryRun`, diff, destructive-change detection (`validateConfigChange`) and `planHash`; JSON Schema export |
| P1.8 | Services and adapters: AuditService, EventService (outbox), Mailer (SMTP, TS templates with escaping), `StorageAdapter` + S3 adapter (presign PUT with signed length/type, presign GET with disposition, HEAD, COPY, DELETE, stream), RateLimiter (Postgres + memory), UsageMeter, Entitlements (`unlimited`), Clock, Ids |
| P1.9 | AbuseGuard pipeline per §D.5: body limits, rate limits, origin check, honeypot, PoW (ALTCHA protocol via `altcha-lib`, replay protection), heuristics hooks, quota hook; `GET /v1/public/challenge`; CORS for public routes |
| P1.10 | Worker: pg-boss setup, job registry from modules, outbox dispatcher, cron jobs (PoW replay, idempotency and rate-limit cleanup), graceful shutdown |
| P1.11 | OpenAPI pipeline: `@hono/zod-openapi`, `/v1/openapi.json`, export to `packages/api-contract`, TS types via `openapi-typescript`, `bun run api:check` drift check in CI, breaking-change check (`oasdiff`) |
| P1.12 | Dashboard shell: login, sign-up, verification, password reset, accept invitation; org and project switcher; navigation from the web module registry; pages: projects, project settings (name, domains), Embed (create key with preset / reveal once / revoke), members (invite, roles), activity log |
| P1.13 | Tenant isolation suite: fixtures 2 orgs × 2 projects × roles; automatic iteration over all registered management routes (foreign credentials → 404); part of `bun run test` |

**Acceptance (M1):** sign-up → org → project → keys → invite works in the dashboard (Playwright); isolation suite covers 100 % of management routes and is green; audit entries visible for key and member actions; secret key with foreign origin → 403 + audit; OpenAPI drift check active in CI.

## P2 – Forms (9–11 PD) → M2 · `v0.1.0`

| ID | Task |
|---|---|
| P2.1 | `packages/modules/forms`: config schema (field types and rules per §D.8, honeypot, PoW, HTML redirects, `retentionDays`, `identifiesSubject`), templates (contact, quote request, job application, event sign-up), `validateConfigChange` (field removed / type changed = destructive) |
| P2.2 | Runtime validator: config → Zod; normalization (trim, lowercase email); unknown fields rejected; field errors as problem details |
| P2.3 | Table `form_submissions` + migration; `search_vector` on insert; `expires_at`; `subject_email` |
| P2.4 | Public: `GET /v1/public/forms/{key}` and `POST …/submissions` (JSON + urlencoded with 303 redirect), `Idempotency-Key`, AbuseGuard, spam verdict, event `forms.submission.created`, usage counter; secret-key variant with `forms:submit` without PoW |
| P2.5 | Admin: submissions list (cursor, filters status/read/spam/date, full-text search), detail (rendered with field definitions of the stored `config_version`), patch (status, read, spam), delete, bulk (mark, delete), streamed CSV export (union of fields, CSV-injection safe, owner/admin, audited) |
| P2.6 | Notification rules (CRUD) and sending on new submissions: content-free by default, `include_content` opt-in, throttling (max N/h per rule, then digest) |
| P2.7 | Retention: daily purge job (entries + spam after 30 days), `expires_at` recomputation on retention change; `privacy` handler (export/erase by email) |
| P2.8 | Dashboard "Inbox": form list (counts, unread), tabs Entries (DataTable + RecordDrawer + spam folder), Fields (FieldListEditor with templates, up/down, no logic rules), Settings (spam, notifications, retention), Embed (HTML/fetch/SDK snippets) |
| P2.9 | Minimal `@backbricks/sdk` with `forms.submit` + PoW solving; `examples/html` (plain HTML form without JS **and** fetch variant) |
| P2.10 | Release `v0.1.0` developer preview: changelog, Docker image tag, README quickstart for the dev setup |

**Acceptance (M2):** both HTML examples create entries visible in the dashboard; structured validation errors; honeypot and spam cases handled; notification arrives in Mailpit without content; a CSV field `=SUM(1)` is exported defused; expired entries are purged; isolation suite covers new routes.

## P3 – Uploads (9–12 PD) → M3 · `v0.2.0`

| ID | Task |
|---|---|
| P3.1 | Upload zone config: type presets (images, PDF, office) as allowlist of MIME + extension, `maxSizeMb` (≤ 100), `retentionDays`, scan required |
| P3.2 | Table `files` + migration; key scheme `stg/{org}/{prj}/{fileId}` and `fil/{org}/{prj}/{fileId}` |
| P3.3 | Public: intent → presigned PUT (5 min, content length and type signed) + `uploadToken`; `complete` → HEAD check → `uploaded` → scan job |
| P3.4 | Scan job: COPY to final key, delete staging, magic-byte detection (`file-type`), allowlist re-check, SHA-256, ClamAV `INSTREAM` adapter (`SCANNER=none\|clamav`), statuses `ready/quarantined/rejected`, retries, events, admin notification on quarantine |
| P3.5 | `files` capability (`claim`, `listByOwner`, `deleteByOwner`) with checks (project, zone, token, status, single use, `maxFiles`); forms field type `file` uses it in the same transaction; deleting a submission deletes its files |
| P3.6 | Admin: zones (generic), file list (zone/status/date filters, name search), detail, `POST …/download-url` (60 s, attachment, audited), single/bulk delete (object + row), storage usage |
| P3.7 | Jobs: orphan cleanup (pending or unclaimed > 24 h), retention purge, `privacy` handler |
| P3.8 | Dashboard "Files": table/grid with safe previews, status badges incl. "not scanned", download, multi-select + ConfirmDialog, storage meter; attachments in the forms RecordDrawer |
| P3.9 | SDK `uploads.upload(file, { zone, onProgress, signal })`; example extended with CV upload |
| P3.10 | Storage contract suite (presign with signed length, COPY, HEAD, DELETE, CORS preflight) against Garage in CI and optionally a real provider via env |

**Acceptance (M3):** EICAR → `quarantined`, object deleted, notification sent; an upload larger than declared is rejected by storage; PDF extension with EXE content → `rejected`; a second PUT to the upload URL after `complete` doesn't change the final file (test); foreign or already claimed `fileRef` → error; downloads have `Content-Disposition: attachment`; orphans are deleted.

## P4 – Reviews (5–7 PD) → M4 · `v0.3.0`

| ID | Task |
|---|---|
| P4.1 | Collection config: scale (default 5, max 10), required title/body/email, public extra fields, length limits, `moderation: manual` (default), author name display format, optional "verification method" text |
| P4.2 | Table `reviews` + migration |
| P4.3 | Public: submit (AbuseGuard), list of published reviews (cursor, sort, `limit ≤ 50`), stats (count, average, distribution); `Cache-Control` + `ETag`/`304`; response serializer with an allowlist of fields |
| P4.4 | Admin: list/filter by moderation status, approve/reject, publish/unpublish, delete, stats; no content editing |
| P4.5 | Dashboard "Reviews": queue with keyboard shortcuts, tabs published/rejected, stat cards, embed; hint box about legal transparency duties (marked "please verify legally") |
| P4.6 | SDK `reviews.list`, `reviews.stats`, `reviews.submit`; example extended |

**Acceptance (M4):** only `approved` + `published` + `is_test=false` is public; snapshot test proves email, private fields and `source` never appear in public responses; `If-None-Match` → `304`; stats match fixtures.

## P5 – Agent-ready (12–15 PD) → M5 · `v0.4.0`

| ID | Task |
|---|---|
| P5.1 | SDK complete: `createClient`, `BackbricksError` (`code`, `fieldErrors`, `requestId`), retries for idempotent calls only, lazy PoW web worker (`@backbricks/sdk/pow`), generic `request()`, module augmentation for codegen types, size budget (< 8 KB gz) in CI; tests on Node and Bun |
| P5.2 | `@backbricks/sdk/admin`: generated management client (`openapi-fetch`), adopted by the dashboard |
| P5.3 | CLI foundation (`packages/cli`): command framework, `--json`, `--yes`, documented exit codes, credentials (file 0600 or `BACKBRICKS_SECRET_KEY`), JSON Schema for `backbricks.config.json`; bundled with `bun build --target=node` |
| P5.4 | CLI commands `login`, `init` (framework detection for env var names, `.gitignore`, optional `AGENTS.md` section), `pull`, `diff`, `push` (two-step with `planHash`, `--allow-destructive`), `validate`, `codegen`, `test submit`, `keys list`, `docs` |
| P5.5 | `backbricks doctor`: connectivity, origins, key validity, scan for `bb_sk_` in public env prefixes and build output |
| P5.6 | `backbricks mcp`: stdio MCP server with the tools from §D.9, per-tool scope checks, no delete tools, plan/apply enforced, audit `actor_type='mcp'` |
| P5.7 | Agent docs: `skills/backbricks/SKILL.md`, `llms.txt`/`llms-full.txt`, quickstarts (Next.js, Astro, Vue, HTML), generated error-code reference, Scalar API reference; docs site with Astro Starlight at `/docs` inside `apps/www` (ADR-0001), plus `/errors/*` and `/schema/*` pages |
| P5.8 | Examples: `examples/nextjs` (App Router, custom UI, contact + CV upload + reviews, variant with server action and secret key on the server), `examples/astro`, complete `examples/html` |
| P5.9 | Dashboard wizard "Connect an AI agent": preset key + copyable prompt block for Claude Code/Codex |
| P5.10 | Scenario A E2E: script `init → extend config → push → codegen → build example → Playwright submits form/upload/review → admin API verifies` |

**Acceptance (M5):** scenario A E2E green in CI; `doctor` reports a key deliberately set as `NEXT_PUBLIC_BACKBRICKS_SECRET`; MCP server registers in Claude Code and creates a form via `form_upsert`; SDK size budget held; CLI works with `npx` (Node) and `bunx`.

## P6 – Open Source 1.0 (6–8 PD) → M6 · `v1.0.0`

| ID | Task |
|---|---|
| P6.1 | `deploy/compose/`: production compose (app, worker, migrate one-shot, postgres, garage + init behind profile `storage`, caddy, clamav profile `scan`, backup profile), health checks, volumes, `.env.example`, Caddyfile; `configure` step in the setup CLI that asks for modules and writes `BACKBRICKS_MODULES` + matching `COMPOSE_PROFILES` (§C.7) |
| P6.2 | First-run setup wizard (instance admin, `SIGNUP_POLICY` default `invite_only`), `system_settings` |
| P6.3 | `UPLOAD_MODE=proxy` (streaming through the app with hard limit) for setups without publicly reachable storage |
| P6.4 | Backup container (`pg_dump` + `restic`), restore guide, CI job dump → restore → smoke |
| P6.5 | Upgrade path: semver tags, automatic migrations, Changesets-based `CHANGELOG.md`, upgrade guide, lazy config migration job (`module_version`) |
| P6.6 | Hardening: security headers + strict CSP, login rate limits, `bun audit`, non-root/read-only containers, threat model (STRIDE) in `docs/security/`, verify `SECURITY.md` process |
| P6.7 | Release engineering: SPDX headers in all source files, license check of dependencies (no AGPL-incompatible deps; MIT packages free of copyleft deps), README with quickstart, GHCR image release, npm publish (`@backbricks/sdk`, `backbricks`) with provenance, legal review of `LICENSING.md`/`TRADEMARKS.md` noted in `OPEN_QUESTIONS.md` |
| P6.8 | Scenario C test in CI: fresh runner, `docker compose up` from `deploy/compose`, setup via API, smoke test of all three modules; plus minimal-footprint runs (forms only: app + postgres; uploads only: without ClamAV) |

**Acceptance (M6):** scenario C test green; install on a fresh VM in < 30 min following the README; restore test green; security header checklist satisfied; release pipeline produces image and npm packages; `v1.0.0` tagged.

## C1–C3 – Managed cloud (after M6, plan coarsely only)

| ID | Task | Milestone |
|---|---|---|
| C1.1 | `DEPLOYMENT_MODE=cloud`: open sign-up with mandatory verification, onboarding (org → project → template → embed), disposable-email check | C1 |
| C1.2 | `cloud/` package: plans as config, `PlanEntitlements`, enforcement per §G.6, usage page | C1 |
| C1.3 | Metering jobs: storage gauge, download bytes, monthly close | C1 |
| C1.4 | RLS on all tenant tables, app role without `BYPASSRLS`, dedicated role for cross-tenant jobs, tests | C1 |
| C1.5 | Infrastructure on Hetzner (DE) per §F.7 (OpenTofu or scripted), Postgres with pgBackRest/WAL-G (PITR, offsite), object storage, Caddy, deploy pipeline | C1 |
| C2.1 | Billing adapter (provider per `OPEN_QUESTIONS.md`): checkout, portal, webhooks → plan | C2 |
| C2.2 | Ops: uptime monitoring, logs, EU error tracking, alerting; runbooks (incident, breach/72 h, key rotation, restore) in `docs/ops/` | C2 |
| C2.3 | Restore drill recorded; k6 load test of the public API with documented limits | C2 |
| C2.4 | Legal drafts (external review): DPA, TOMs, sub-processor list, privacy policy, imprint, terms; closed beta | C2 |
| C3.1 | Legal sign-off, status page, public launch | C3 |
| C3.2 | Optional: remote MCP `/mcp` (Streamable HTTP) with OAuth 2.1 via Better Auth OAuth provider | C3 |
| C3.3 | Scenario D E2E on production | C3 |

# PLAN.md format

```markdown
# PLAN – Backbricks

## Overview
- Total estimate: … h / … PD (OSS track) + … PD (cloud track)
- Milestones: see docs/MILESTONES.md (M0–M6, C1–C3)
- Version list: (package → version, checked YYYY-MM-DD, Bun-compatible yes/no/fallback)

## Proposed deviations from ARCHITECTURE.md
- [ ] DEV-1: … (reasoning, impact, recommendation)

## Phase P0 – Foundation (M0)
**Goal:** …
**Depends on:** …

### [ ] P0.1 – Workspace packages (est. 3 h)
- **Description:** …
- **Files/packages:** …
- **Depends on:** –
- **Reuses:** (existing code/helpers this builds on, so nothing gets duplicated)
- **Acceptance criteria:**
  - [ ] …
- **Tests:** …
- **Risks/notes:** …

### Phase acceptance P0
- [ ] … (with the command that proves it)

## Risk register
| # | Risk | Phase | Mitigation | Status |
```

# Start

Confirm in one sentence that you have read `CLAUDE.md`, `docs/ARCHITECTURE.md` and `docs/MILESTONES.md` completely, then start the **planning run (mode A)**. Write no application code.

PROMPT>>>
