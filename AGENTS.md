# AGENTS.md – Backbricks

Backbricks is an open-source (AGPL-3.0) headless platform that gives websites managed backend features (forms, file uploads, reviews). AI coding agents integrate it via API/SDK/CLI/MCP, and non-technical site owners manage data in a dashboard. Self-hostable first; a managed EU cloud follows after 1.0.

This file sets the rules for *how* we work, for every session and every agent (Claude Code reads it via `CLAUDE.md`, Codex and others directly). The other sources:
- `docs/ARCHITECTURE.md`: *what* we build (contracts, data model, API, security). `docs/adr/`: *why* (one ADR per key decision or deviation).
- `docs/MILESTONES.md`: *where* we are going (scope and exit criteria). `PLAN.md`: the tasks. `OPEN_QUESTIONS.md`: decisions waiting for the maintainer.
- Contributors working from a GitHub issue: this file and `CONTRIBUTING.md`; the roadmap workflow (§9) is for maintainers.

---

## 1. Golden rules

1. **Think in the whole system, not the file.** Before changing anything, understand where it sits: which module, which layer, who calls it, what depends on it. A local fix that breaks a contract elsewhere is not a fix.
2. **Search before you write.** Before creating a function, type, schema, component, hook, util or constant, look for an existing one (use the code graph first, see §6). If something similar exists, **reuse it, extend it, or generalize it**, in that order. Create new code only when nothing fits.
3. **One source of truth for everything.** Each concept (schema, type, constant, error code, config, UI pattern, environment definition) lives in exactly one place and is imported everywhere else. Derive, don't duplicate: types come from Zod schemas, API types from OpenAPI, the dashboard client from the same contract as the SDK. The same goes for docs: once something is built, the code is the source of truth and the docs link to it.
4. **Respect boundaries.** Modules talk to the core through contracts and to each other only through capabilities. Never reach across a boundary because it is quicker.
5. **Small, coherent changes.** One task per change, tests included, nothing unrelated mixed in. If you notice something else that is broken, note it (`PLAN.md` or a TODO with an issue reference); don't silently fix it in the same change.
6. **Leave it cleaner, not bigger.** Prefer deleting and consolidating over adding. Dead code, unused exports and stale comments go.
7. **When in doubt, follow the architecture.** If the architecture doesn't cover a case, choose the simplest option that satisfies all invariants (§3) and record it as an ADR. If an option would violate an invariant or a key decision (`docs/ARCHITECTURE.md` §0/§J.2), stop and ask.

## 2. Clean architecture and avoiding duplication

### 2.1 Layers and dependency direction

```
apps/web ──────────────► packages/ui, @backbricks/sdk/admin (generated client)
apps/www ──────────────► packages/ui only (static website; docs from M5, ADR-0001)
apps/server ───────────► packages/modules/* ─► packages/core ◄─ packages/adapters
                │                                   ▲
                └──► packages/db, packages/auth ────┘
packages/sdk, packages/cli ─► packages/api-contract (types only). NEVER server code.
```

- `core` defines contracts (interfaces, Zod schemas, errors, IDs, TenantContext) and pure logic. It depends on nothing internal.
- `adapters` implement core interfaces for the outside world (S3, SMTP, ClamAV, Postgres rate limiter). Swapping a provider = new adapter, no core change.
- `modules/*` contain domain logic and import only `@backbricks/core` and their own files. Cross-module needs go through **capabilities** registered in the core.
- `apps/*` compose everything (dependency injection, routing, process roles). Apps contain wiring, not business logic.
- Dependency rules are enforced by dependency-cruiser in CI (`bun run lint:arch`). Do not weaken a rule to make code compile; restructure the code instead.

### 2.2 Where things go

| You need… | Put it in… | Never… |
|---|---|---|
| A type for an API payload | the Zod schema in the route/contract; `z.infer` it | hand-write a parallel TS interface |
| An API type on the client side | `packages/api-contract` (generated from OpenAPI) | copy types into `web`, `sdk` or `cli` |
| A new error | `packages/core/src/errors/codes.ts` catalog + `AppError` | throw ad-hoc strings or new error classes per module |
| A helper used by 2+ modules | `packages/core` (pure) or an adapter (I/O) | copy it into each module |
| A helper used by one module | inside that module | put it in core "just in case" |
| A UI component used by 2+ screens | `packages/ui` | copy-paste JSX between pages |
| Pagination, CSV export, filtering, audit, events, retention | the existing core helpers | re-implement per module |
| Env/config values | `packages/core/config` (Zod-validated) | read `process.env` / `Bun.env` anywhere else |
| Constants (limits, prefixes, defaults) | one constants file per owner (core or module) | magic numbers in code |
| Environment definition (services, ports) | `compose.yaml` (dev + CI) / `deploy/compose/` (prod) | separate CI service definitions |
| Tool versions | `mise.toml` | install instructions that pin versions elsewhere |

### 2.3 Duplication policy

- **Same meaning, second occurrence → extract.** If the same *concept* appears twice, consolidate before or as part of your change.
- **Similar shape, different meaning → keep separate.** Don't merge code that merely looks alike (e.g. a form field limit and an upload size limit). Wrong abstractions are worse than duplication.
- **Generalize through the contract.** If a module needs something the core lacks, extend the core contract once (with an ADR when it changes `ModuleDefinition`) instead of working around it locally.

### 2.4 Design rules

- Pure functions for logic; side effects at the edges (adapters, routes, jobs).
- Dependency injection via the service container (`ctx.services`), no module-level singletons with hidden state.
- Validate at boundaries (HTTP, env, config files, job payloads), then trust typed data inside.
- Files stay focused (rough guide: < 300 lines). Split by responsibility, not arbitrarily.
- Public functions of a package are exported through its `index.ts`; deep imports into other packages are not allowed.

## 3. Non-negotiable invariants

These are canonical (cited as I1–I19 everywhere). Violations block merges.

**Tenancy**
- **I1** Every tenant table has `organization_id` and, if project-scoped, `project_id`. Tenant tables are accessed only via `withTenant(ctx, fn)` and its repositories.
- **I2** Resources of other tenants return `404`, never `403`.
- **I3** Every management route declares its requirements (`role` and/or `scope`); a test fails for undeclared routes. Every route is covered by the tenant isolation suite.

**Secrets and access**
- **I4** Secret keys are stored only as SHA-256 hashes and shown once. Secrets never appear in logs, errors, events or audit diffs.
- **I5** Public endpoints never return more than explicitly public data (public form schema, published reviews without private fields, the caller's own upload/submission IDs).
- **I6** A secret key used with a foreign `Origin` header is rejected (`403 secret_key_exposed`), audited and reported.
- **I7** Keys are created only via a dashboard session. No key and no MCP tool can create keys, delete data or read personal data without an explicitly granted scope.

**User content and files**
- **I8** User content is untrusted: no `dangerouslySetInnerHTML`, CSV-injection protection in exports, HTML escaping in emails, reviews as plain text.
- **I9** Files are private. Downloads only via short-lived presigned GET with `Content-Disposition: attachment`; inline preview only for detected PNG/JPEG/WebP/GIF, never SVG/HTML. Object keys never contain original file names. Scans run on a copy that no upload URL ever pointed to (copy-then-scan).
- **I10** Server-side Zod validation of every input; body size limits on all routes; no user-provided regex.

**Privacy**
- **I11** IPs only as rotating HMAC hashes. Personal data is hard-deleted. Personal records, audit and transient security/delivery records have bounded expiry (`expires_at` or the auth library's equivalent). Active auth identities/memberships and notification recipient configuration follow their explicit lifecycle and are hard-deleted on removal/erasure; they do not expire arbitrarily (ADR-0022). Notification emails contain no submission content by default.
- **I12** Every administrative mutation writes an audit entry in the **same transaction** (never submission content).

**Architecture and open source**
- **I13** Modules import only `@backbricks/core` and their own files; collaboration only via capabilities.
- **I14** No proprietary cloud service in the core. Storage, mailer, scanner, captcha, rate limiter, entitlements and billing are interfaces with swappable implementations.
- **I15** No `if (cloud)` branches in modules; self-host vs. cloud differs only through dependency injection (`DEPLOYMENT_MODE`).
- **I16** Headless: websites never have to embed our UI, iframes or CSS.
- **I17** The public API (`/v1`) changes additively only. `packages/api-contract/openapi.json` is committed; CI fails on unintended drift.
- **I18** MIT packages (`packages/sdk`, `packages/cli`, `examples/*`, `skills/*`) never import AGPL code (server, core, modules) and must run on Node ≥ 20 and Bun.
- **I19** Every module is optional (`BACKBRICKS_MODULES`). The core and each module must work with any subset enabled: no module assumes another is present except via declared `requires`/`optional` capabilities, and infrastructure (storage, scanner, …) is required only when an enabled module declares it. See `docs/ARCHITECTURE.md` §C.7.

## 4. Stack and commands

Stack: **Bun** (runtime, package manager, tests) · **TypeScript 7** · **Turborepo** · **Hono** · **Drizzle + PostgreSQL 18** · **pg-boss** · **Better Auth** · **React 19 + Vite + TanStack + shadcn/ui + Tailwind v4** · **oxlint/oxfmt** · **Playwright** · **Docker Compose** · **mise** · **lefthook**. Full list: `docs/ARCHITECTURE.md` §H; reasons in the ADRs.

| Task | Command |
|---|---|
| Install pinned tools | `mise install` |
| First-time setup (deps, git hooks, code graph) | `mise run setup` |
| Run the full dev environment in Docker | `mise run dev` |
| Infra only (Postgres, Garage, Mailpit) | `mise run infra` |
| Everything CI checks (run before pushing) | `bun run check` |
| Format / check formatting | `bun run format` / `bun run format:check` |
| Lint (type-aware) / architecture rules | `bun run lint` / `bun run lint:arch` |
| Typecheck / test / build (all, via Turborepo) | `bun run typecheck` / `bun run test` / `bun run build` |
| Only what changed | `bunx turbo run test --affected` |
| E2E | `bun run test:e2e` |
| DB migrations | `bun run db:generate` / `bun run db:migrate` |
| Regenerate OpenAPI contract + check drift | `bun run api:generate` / `bun run api:check` |

Add new scripts to the root `package.json` (Turborepo pipelines) or `mise.toml` (environment orchestration), never both for the same thing.

## 5. Conventions

- TypeScript `strict`, `noUncheckedIndexedAccess`; no `any` (if unavoidable, `// oxlint-disable-next-line` with a reason). ESM only. Named exports.
- Naming: files `kebab-case.ts`, types/components `PascalCase`, functions/variables `camelCase`, DB columns `snake_case`, env vars `UPPER_SNAKE_CASE`.
- IDs: TypeIDs (`prj_`, `key_`, `mod_`, `rvn_`, `sub_`, `file_`, `rev_`, `evt_`, `aud_`, `ntf_`, `req_`), generated only via `ids`.
- Time only via `clock`. No `Date.now()` in domain code (testability).
- Errors: `new AppError(code, { detail, errors, hint })` → RFC 9457 response. The HTTP status comes from the code catalog (`packages/core/src/errors/codes.ts`), one status per code.
- Logging: pino via `ctx.log`, structured, never secrets or personal data. No `console.*` in app code.
- Dashboard: all copy through i18n keys (en, de), non-technical wording (`docs/ARCHITECTURE.md` §E.1). shadcn/ui components live in `packages/ui`; add them with the shadcn CLI there, then customize.
- Dependencies: add a runtime dependency only with a one-line justification in the commit body; prefer the platform (Bun/Web APIs) and existing deps.
- Comments explain *why*, not *what*. Public APIs of packages get TSDoc.

## 6. Code graph (CodeGraph)

A local semantic code graph (`.codegraph/`, gitignored; built by `mise run setup` or `codegraph init`) is exposed through the `codegraph` MCP server (`.mcp.json`) and the `codegraph` CLI. Use it **before reading files or grepping**: to find existing code before adding something (golden rule 2), and to see callers and impact before changing a shared function, schema or contract (update all affected call sites in the same change). Agents without the MCP server (e.g. Codex) use `codegraph explore "<query>"`.

## 7. Testing

- **Runner:** `bun test` for unit, integration and component tests (`@testing-library/react` + `happy-dom`); **Playwright** for E2E and SDK browser tests; `fast-check` for validators, escaping and config diffs.
- Tests live next to code (`*.test.ts`); E2E tests in `apps/web/e2e/` and `e2e/`.
- **No database mocks.** Integration tests run against the real compose services (Postgres, Garage, Mailpit, ClamAV when relevant), with each test isolated (transaction rollback or unique tenant fixtures).
- Every new management route → covered by the tenant isolation suite (I3). Every public response → snapshot test proving no private fields (I5).
- Bug fix = failing test first, then the fix.
- Test behavior through public interfaces, not implementation details.

## 8. Git workflow

- `main` is protected; all changes go through PRs against `main`. CI must be green.
- Branches: `feat/…`, `fix/…`, `chore/…`, `docs/…`, optionally with the task ID (`feat/p2-4-public-submissions`).
- **Conventional Commits** with the task ID or issue reference: `feat(forms): public submission endpoint [P2.4]`, `fix(uploads): reject empty files (#123)`.
- **DCO sign-off on every commit:** `git commit -s`. The `commit-msg` hook checks it locally, CI checks it again. The sign-off certifies the *human* behind the commit; an agent commits under that person's identity, so that person must have reviewed the change (`CONTRIBUTING.md`, "AI-assisted contributions").
- The `pre-push` hook (lefthook) runs format check, lint, typecheck and affected tests. Don't bypass hooks with `--no-verify`.
- Agents: commit on a feature branch after each completed task (or logical step of an issue). Don't push or open PRs unless asked. Never rewrite published history.

## 9. Roadmap workflow and definition of done

The maintainer drives the roadmap phase by phase with requests like "plan P1", "execute P1", "review P1". Each runs in a fresh session.

- **Plan a phase:** refine the phase's stub in `PLAN.md` into tasks of 2–6 h in the task format at the top of `PLAN.md`. Check current versions of new dependencies (`npm view <pkg> version`) and add them to the version list. Record weaknesses or gaps in the architecture under "Proposed deviations" (never change the architecture silently) and decisions the maintainer must make in `OPEN_QUESTIONS.md`, each with a recommendation and the task that needs the answer. No application code. End with a summary: tasks, estimate, top risks, open questions.
- **Execute a phase** (or a given task range): create a feature branch if on `main`. Read the `PLAN.md` phase section, `OPEN_QUESTIONS.md`, the ADR index plus the ADRs and ARCHITECTURE sections the tasks cite, and the latest `docs/progress/` report. Work in `PLAN.md` order; per task: code graph → implement → tests → `bun run check` green → tick the checkbox → signed-off commit. A decision the architecture doesn't cover: take the simplest option that satisfies all invariants, write an ADR, list it in `OPEN_QUESTIONS.md` under "Decided, please confirm", keep going. When resuming, start at the first unticked task and check `git status`/`git diff` for partial work. At the end, demonstrate every exit criterion of the milestone with commands, write `docs/progress/phase-N.md` (done, deviations, known gaps, new risks, evidence) and stop. Don't push.
- **Review a phase:** only in a session that didn't implement it. Run `bun run check`; check every invariant with concrete locations (file:line) or missing tests; look for unscoped queries, undeclared routes, private fields in public responses, secrets in logs, mutations without audit, cross-module imports, `dangerouslySetInnerHTML`, unchecked uploads; look for duplication and drift (concepts built twice, helpers that belong in core, hand-written types that should be derived, copy-pasted UI). Write `docs/progress/review-phase-N.md` with findings by severity (location, scenario, fix). Change no code.
- **New module:** follow "Rules for new modules" in `docs/MODULES.md`.

**Done means:**
- **Change (every PR):** code + tests + `bun run check` green + docs updated where behavior changed + no new duplication (§2.3) + signed-off commits + PR linked to its issue or task ID.
- **Task:** the above + `PLAN.md` checkbox ticked.
- **Phase:** all tasks done, exit criteria demonstrated with commands, isolation suite and OpenAPI drift check green, report in `docs/progress/phase-N.md`.

## 10. Don'ts

- Don't add features outside the current task or milestone scope (see "Out of scope for v1" in `docs/ARCHITECTURE.md` §1 and `docs/MILESTONES.md`).
- Don't introduce new infrastructure (Redis, queues, services) without an ADR.
- Don't build generic engines (workflow, CMS, no-code DB) "for later".
- Don't guess library APIs or versions. Read the current docs or types, check current stable versions and pin exactly (versions change fast: Bun, Better Auth, Drizzle, oxlint, TS 7).
- Don't commit secrets, `.env` files or generated local state (`.codegraph/`, `.turbo/`).
- Don't edit generated files by hand (`packages/api-contract/*`, migrations after they're applied); regenerate them.
