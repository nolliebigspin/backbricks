# PLAN – Backbricks

> Produced by the planning run (`/bb-plan P0`, mode A of `docs/PLANNING_PROMPT.md`) on 2026-11-04.
> **Scope of this run:** phase P0 is broken down into tasks. P1–P6 and C1–C3 are stubs that carry the task IDs from the planning prompt; refine each with `/bb-plan P<N>` before its execution run.
> Decisions the maintainer must make: [`OPEN_QUESTIONS.md`](OPEN_QUESTIONS.md). Key decisions: [`docs/adr/`](docs/adr/).

## Overview

- **Total estimate:** P0 **47 h ≈ 5.9 PD** (detailed). P1–P6 use the planning prompt's ranges until refined: 53–68 PD. **OSS track ≈ 59–74 PD.** Cloud track (C1–C3) **15–21 PD**.
- P0 is about 1 PD over the prompt's 4–5 PD. The extra comes from the library spike, the Garage init (the Garage image has no shell) and the Docker setup for Bun's isolated linker. DEV-4 and DEV-7 keep P1 work out of P0.
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
| Arch rules | dependency-cruiser | 18.7.2 | to verify (P0.2) | `engines: node ^22‖^24‖>=26`; if it fails under Bun, run via mise's Node. TS parsing on TS 7 → `@swc/core` 1.16.21 parser |
| Server | hono | 4.13.16 | yes | native `Bun.serve` |
| | zod | 4.6.7 | yes | |
| | pino / pino-pretty | 10.4.0 / 13.2.0 | yes | pino-pretty dev only |
| | typeid-js | 1.2.0 | yes | check license in P0.6; alternative: own encoder on `Bun.randomUUIDv7()` |
| DB | drizzle-orm / drizzle-kit | 1.0.0-rc.5 / 1.0.0-rc.5 | to verify (P0.9a) | RC chosen (Q1, 2026-11-05); stable 0.45.4 / 0.31.11 is the fallback; upgrade to 1.0 GA when released |
| | pg / @types/pg | 8.23.1 / 8.23.1 | to verify (P0.9a) | one driver shared with pg-boss |
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
| Spiked in P0.9, used later | better-auth | 1.7.17 | to verify (P0.9a) | CLI moved to package `auth` 1.7.16 (`@better-auth/cli` is stale at 1.4.21); `auth` declares `node >=22.12` |
| | pg-boss | 12.38.0 | to verify (P0.9a) | `engines: node >=22.12`; fallback: worker role on Node (ADR) |
| | @aws-sdk/client-s3 / s3-request-presigner | 3.1161.0 | to verify (P0.9b) | signed Content-Length against Garage |
| | altcha-lib | 2.8.0 | to verify (P0.9b) | |
| | @modelcontextprotocol/sdk | 1.32.2 | to verify (P0.9b) | must also run on Node ≥ 20 (I18) |
| | nodemailer | 10.3.1 | to verify (P1.8) | |
| | file-type | 22.3.0 | to verify (P3.4) | |
| | @hono/zod-openapi | 1.6.3 | yes | peer zod ^4, hono ≥4.10 |
| | openapi-typescript | 7.13.0 | to verify (P0.9b) | peer `typescript ^5` → tool-local TS 5.9.3 in `api-contract` |
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
- [x] **DEV-5: Env access is banned with `node/no-process-env` and `no-restricted-properties` (`Bun.env`, `import.meta.env` outside apps/web).** The prompt's `no-restricted-imports` can't catch property access. Overrides: `packages/core/src/config/**`, `scripts/**`, `*.config.ts`. *Recommendation:* accept.
- [ ] **DEV-6 (only if triggered): repo-wide TypeScript 6.0.3.** Step 3 of the TypeScript 7 decision rule. Changes key decision #2, recorded in ADR-0020 with the doc updates listed above.
- [x] **DEV-7: No `setup` role stub in P0.** The first-run setup arrives with P6.2; a stub that only prints "not implemented" is dead code (AGENTS.md golden rule 6). P0 ships `serve | worker | all | migrate`. The P0 worker connects to the DB, logs ready, idles and shuts down cleanly (pg-boss comes in P1.10). *Recommendation:* accept.
- [ ] **DEV-8 (affects P1; decide at `/bb-plan P1`): Generate the admin client in P1.11.** The P1.12 dashboard shell needs a typed management client, but `@backbricks/sdk/admin` only arrives in P5.2. Without a change, P1.12 would hand-write fetch calls or types (against AGENTS.md §2.2). Proposal: generate the `openapi-fetch` client together with the contract in P1.11; P5.2 then only packages and documents it.

## Phase P0 – Foundation (M0)

**Goal:** A runnable, tested skeleton every later phase builds on: workspaces, enforced architecture rules, a Docker Compose dev environment shared with CI, validated config, the server with process roles, the database layer, the dashboard skeleton, the production image, and verified library choices.
**Depends on:** the existing bootstrap (`mise.toml`, root `package.json`, `turbo.json`, `tsconfig.base.json`, `.oxlintrc.json`, `.oxfmtrc.json`, `lefthook.yml`, `.github/workflows/ci.yml`, `packages/ui`, `apps/www`).
**Milestone:** M0. **Estimate:** 47 h.

### [ ] P0.1 – Workspace packages (est. 3 h)
- **Description:** Create the package shells from `docs/ARCHITECTURE.md` §G.1: `apps/server`, `apps/web`, `packages/{core,db,auth,adapters,api-contract,sdk,cli}`, `packages/modules/{forms,uploads,reviews}`. Each gets `package.json`, `tsconfig.json` (extends the root `tsconfig.base.json`, DEV-1), `src/index.ts` and `typecheck` + `test` scripts; `build`/`dev` only where an artifact or process exists (DEV-2). Names: `@backbricks/<name>`, modules `@backbricks/module-<name>`, the CLI package `backbricks`. `license` field per `LICENSING.md`; MIT packages (`sdk`, `cli`) get their own `LICENSE`. MIT packages also declare `engines.node >=20` (I18). Remove `packages/tsconfig` from ARCHITECTURE §G.1 and LICENSING.md (DEV-1, accepted).
- **Files/packages:** `apps/server/`, `apps/web/` (shell only; content in P0.5/P0.7), `packages/*/`, `packages/modules/*/`, `bun.lock`, `scripts/workspace/workspaces.test.ts`.
- **Depends on:** –
- **Reuses:** package layout of `packages/ui` (`exports` → `src/index.ts`, `typecheck` script), root `turbo.json` tasks, `tsconfig.base.json`.
- **Acceptance criteria:**
  - [ ] All packages from §G.1 exist and are listed by `bun pm ls` as workspaces
  - [ ] License fields match `LICENSING.md`; `packages/sdk/LICENSE` and `packages/cli/LICENSE` contain the MIT text
  - [ ] `bun run typecheck` and `bun run test` pass; Turborepo runs the new packages' tasks
- **Tests:** `scripts/workspace/workspaces.test.ts` (runs with `bun run test:scripts`): reads all workspace `package.json` files and asserts name prefix, license per path (MIT for sdk/cli/examples/skills, AGPL otherwise), presence of the MIT `LICENSE`, `type: module`, `private: true` except sdk/cli.
- **Risks/notes:** Keep `src/index.ts` minimal (an `export {}` is fine); real content arrives with each task. Don't add dependencies the shells don't use.

### [ ] P0.2 – Architecture rules (est. 4 h)
- **Description:** Add dependency-cruiser with rules that mirror AGENTS.md §2.1: `packages/modules/*` → only `@backbricks/core` and their own files (I13); `packages/core` → no internal package; `packages/sdk`, `packages/cli` → only `@backbricks/api-contract` (I18); `apps/www` → only `@backbricks/ui` (ADR-0001 follow-up); `apps/web` → `@backbricks/ui`, `@backbricks/api-contract` (later `@backbricks/sdk/admin`), never server packages; no deep imports into another package's `src/`; no circular dependencies; no imports of `devDependencies` from production code. Script `bun run lint:arch`, added to `check`, `check:affected` and the CI quality job. Complete the oxlint rule set: `node/no-process-env` + `no-restricted-properties` (`Bun.env`) with overrides (DEV-5); `react/no-danger` already exists. **First TypeScript 7 gate** (decision rule): make dependency-cruiser parse `.ts`/`.tsx` including type-only imports.
- **Files/packages:** `.dependency-cruiser.cjs`, root `package.json` (script + devDependency), `.oxlintrc.json`, `.github/workflows/ci.yml`, `scripts/arch/fixtures/**`, `scripts/arch/arch-rules.test.ts`.
- **Depends on:** P0.1
- **Reuses:** existing `check`/`check:affected` scripts, lefthook `pre-push` (runs `check:affected`, so no hook change needed), the CI quality job.
- **Acceptance criteria:**
  - [ ] `bun run lint:arch` passes on the repo and fails on each fixture violation (module → db, core → db, sdk → server, www → core, deep import)
  - [ ] `process.env` / `Bun.env` outside the config package fails `bun run lint`
  - [ ] `lint:arch` runs in `check`, in CI and (via `check:affected`) in pre-push
- **Tests:** `scripts/arch/arch-rules.test.ts` runs dependency-cruiser against small fixture trees and asserts one violation per fixture.
- **Risks/notes:** dependency-cruiser declares `node ^22‖^24‖>=26`; if it fails under Bun, run it via mise's Node (`node node_modules/.bin/depcruise`). TS 7 parsing: try the default, then `parser: "swc"`, then the decision rule (step 3). Record the outcome in ADR-0020.

### [ ] P0.3a – Compose: infrastructure services (est. 4 h)
- **Description:** `compose.yaml` at the repo root with the infra services: `postgres` (`postgres:18.6-alpine`, `pg_isready` healthcheck, named volume), `garage` (`dxflrs/garage:v2.5.0`, profile `storage`, single-node `docker/garage/garage.toml`, healthcheck via the admin API), `garage-init` (one-shot, profile `storage`, runs `scripts/dev/garage-init.ts` from the dev image: apply layout, create bucket, import the fixed dev key, allow the key on the bucket, set CORS via S3 `PutBucketCors`; idempotent), `mailpit` (`axllent/mailpit:v1.33.0`, SMTP 1025, UI 8025), `clamav` (`clamav/clamav:1.5.4-debian`, profile `scan`, port 3310, long `start_period`). Ports per OPEN_QUESTIONS D6. Update `mise run infra` to start what CI needs (`postgres garage mailpit` with `--profile storage`).
- **Files/packages:** `compose.yaml`, `docker/garage/garage.toml`, `scripts/dev/garage-init.ts`, `mise.toml`.
- **Depends on:** P0.1
- **Reuses:** the existing `mise` tasks `infra`/`down`/`reset`; the CI test job's `docker compose up -d --wait postgres garage mailpit`.
- **Acceptance criteria:**
  - [ ] `mise run infra` → `docker compose ps` shows postgres, garage, mailpit healthy and `garage-init` exited 0
  - [ ] Running `garage-init` a second time exits 0 without changes
  - [ ] `docker compose --profile scan up -d clamav` becomes healthy on arm64 and amd64
  - [ ] `docker compose up -d postgres mailpit` works without the `storage` profile (forms-only footprint)
- **Tests:** `scripts/dev/garage-init.test.ts` (integration, needs compose): after init, an S3 `HEAD bucket` with the dev key succeeds and a CORS preflight returns the configured origin.
- **Risks/notes:** Garage's image has no shell, so `garage-init` can't use it; check the admin API v2 endpoints against the v2.5.0 docs. ClamAV needs ~1.5–2 GB RAM; it stays behind the `scan` profile.

### [ ] P0.3b – Compose: app services and dev image (est. 4 h)
- **Description:** `docker/dev.Dockerfile` (base `oven/bun:1.4.4`). Services: `deps` (one-shot `bun install --frozen-lockfile`), `server` (`bun --watch apps/server/src/main.ts serve`), `worker` (`… worker`), `web` (Vite dev server with HMR on 5173). Source is bind-mounted; `node_modules` live in named volumes, **one for the root and one per workspace**, because Bun's isolated linker writes per-package `node_modules` symlinks and the host's darwin binaries must not leak into the Linux container. `depends_on` with `service_healthy` / `service_completed_successfully`. `.env.example` with documented dev values (filled out further in P0.4). `mise run dev` keeps `docker compose up --build`. CI keeps using the same file.
- **Files/packages:** `docker/dev.Dockerfile`, `compose.yaml`, `.env.example`, `.dockerignore`, `mise.toml`, `scripts/dev/compose-volumes.test.ts`.
- **Depends on:** P0.3a
- **Reuses:** the root `dev` script (`turbo run dev`) only on the host; compose runs each process directly so logs stay per service.
- **Acceptance criteria:**
  - [ ] `mise run setup && mise run dev` starts infra, `deps`, server, worker, web; a file change in `apps/server/src` restarts the server; a change in `apps/web/src` hot-reloads
  - [ ] No `node_modules` written to the host by the containers
  - [ ] The CI test job uses `compose.yaml` and no other service definitions
- **Tests:** `scripts/dev/compose-volumes.test.ts` parses `compose.yaml` and asserts there is a `node_modules` volume for every workspace (keeps the list from drifting as packages are added).
- **Risks/notes:** File watching across the macOS bind mount can be unreliable; enable polling (`server.watch.usePolling` in Vite, `--watch` polling if needed) and document it. Server and web can't run until P0.5/P0.7; until then the services start a placeholder command, which those tasks replace.

### [ ] P0.9a – Library spike: database libraries (est. 3 h)
- **Description:** Throwaway scripts (scratchpad, not committed) on Bun 1.4.4 against compose Postgres: Drizzle `1.0.0-rc.5` (Q1) with `pg` (pool, transaction, `select set_config(…, true)`, generate + migrate with the 1.0 migration folder format); pg-boss 12 (start, send, work, schedule, shutdown; sharing the `pg` pool or connection string); Better Auth 1.7 with the Drizzle adapter, organization plugin and `auth generate` for the schema.
- **Files/packages:** none committed except the findings in `docs/adr/0020-library-compatibility.md` (written in P0.9b).
- **Depends on:** P0.3a
- **Reuses:** compose Postgres.
- **Acceptance criteria:**
  - [ ] Each library either works on Bun with the steps above, or has a documented fallback
  - [ ] Drizzle 1.0 RC works with `pg` on Bun, or the fallback to 0.45.4 is documented with the reason
- **Tests:** – (spike)
- **Risks/notes:** pg-boss and `auth` declare `node >=22.12`; Bun reports a Node 24 compatible version, but check runtime behavior (timers, `pg` pool events, shutdown).

### [ ] P0.9b – Library spike: storage, PoW, MCP, codegen; ADR (est. 3 h)
- **Description:** On Bun: AWS SDK v3 presigned PUT with signed `Content-Length`/`Content-Type` against Garage (an oversized or mismatched PUT must be rejected by storage), presigned GET with `response-content-disposition`, `CopyObject`, `HeadObject`; `altcha-lib` 2.x challenge create/verify; MCP SDK stdio server on Bun **and** Node 24; `openapi-typescript` with a tool-local TS 5.9.3 next to root TS 7 (does Bun's isolated linker resolve the local version for the tool?); Better Auth `auth generate` under TS 7; oxlint type-aware on the repo. **Second TypeScript 7 gate** (decision rule). Write ADR-0020 "Library compatibility on Bun and TypeScript 7" with commands, results, fallbacks and the TS 7/6 outcome; update the version list in this file.
- **Files/packages:** `docs/adr/0020-library-compatibility.md`, `docs/adr/README.md`, `PLAN.md` (version list).
- **Depends on:** P0.9a, P0.2 (first TS gate result)
- **Reuses:** compose Garage + `garage-init` dev key.
- **Acceptance criteria:**
  - [ ] ADR-0020 lists each library: works / works with fallback / blocked, with the command that shows it
  - [ ] The TS 7 decision is made (stay, tool-local fallbacks, or DEV-6) and recorded
- **Tests:** – (spike; the storage contract suite in P3.10 turns the S3 findings into tests)
- **Risks/notes:** If Garage doesn't enforce the signed `Content-Length`, that affects M3's acceptance; flag it in the risk register immediately.

### [ ] P0.4 – Config (est. 4 h)
- **Description:** `packages/core/src/config`: a Zod-validated env config. Base part: `NODE_ENV`, `DEPLOYMENT_MODE` (`self_hosted|cloud`), `BACKBRICKS_MODULES` (comma list, default all), `DATABASE_URL`, `APP_SECRET`, `PUBLIC_URL`, `PORT`, `LOG_LEVEL`. Infrastructure parts: `storage` (S3 endpoint, region, bucket, keys, force path style), `scanner` (`SCANNER=none|clamav`, ClamAV host/port), `mailer` (SMTP, optional). `loadConfig(env, infra)` composes the base with the parts required by the enabled modules' `InfraRequirement[]`. Each module shell exports its `infrastructure` declaration now (`forms: []`, `uploads: ['storage', { scanner: 'optional' }]`, `reviews: []`); P1.6 moves it into `ModuleDefinition` without duplicating it. `*_FILE` variants (Docker secrets) win over plain values; setting both is an error. Invalid config → readable list of problems (variable name and reason, never the value) and `exit(1)`. Document every variable in `.env.example`.
- **Files/packages:** `packages/core/src/config/*`, `packages/core/src/modules/infrastructure.ts` (the `InfraRequirement` type), `packages/modules/*/src/index.ts`, `.env.example`.
- **Depends on:** P0.1, P0.2 (env rule)
- **Reuses:** zod; the only allowed `process.env` read lives here (DEV-5).
- **Acceptance criteria:**
  - [ ] `BACKBRICKS_MODULES=forms` loads without any S3 variable; `uploads` requires them
  - [ ] Unknown module names fail with the list of valid ones
  - [ ] Error output never contains a value (I4)
- **Tests:** unit tests for composition, `*_FILE` handling (temp files), unknown modules, defaults; fast-check for the module list parser (whitespace, duplicates, case); snapshot of the error output for a broken env.
- **Risks/notes:** Keep the module → infrastructure mapping in the module packages, not in core or apps (single source of truth).

### [ ] P0.6 – Database package (est. 5 h)
- **Description:** `packages/db`: `pg` pool + Drizzle instance factory (config from P0.4), `drizzle.config.ts`, migrations folder `packages/db/migrations/` with an empty initial migration, migration runner that takes `pg_advisory_lock` around Drizzle's migrator (`bun run db:migrate`, `bun run db:generate` at the root). `withTenant(ctx, fn)` skeleton: opens a transaction, sets `app.org_id`/`app.project_id` with `select set_config($1, $2, true)` (bind parameters; `SET LOCAL` can't take them), passes the transaction to `fn`. TypeID helper `ids` (prefixes from AGENTS.md §5) and the `TenantContext`/`WithTenant` types in `packages/core` (DEV-3).
- **Files/packages:** `packages/db/src/{client,migrate,with-tenant}.ts`, `packages/db/drizzle.config.ts`, `packages/db/migrations/`, `packages/core/src/ids/*`, `packages/core/src/tenancy/*`, root `package.json` scripts.
- **Depends on:** P0.4, P0.9a
- **Reuses:** config from P0.4; P0.9a findings.
- **Acceptance criteria:**
  - [ ] `bun run db:migrate` applies migrations against compose Postgres; a second run is a no-op
  - [ ] Two concurrent migrate runs: one applies, the other waits and then finds nothing to do
  - [ ] Inside `withTenant`, `current_setting('app.org_id')` returns the org; after the transaction it's empty
  - [ ] `ids.generate('sub')` → `sub_…` (TypeID, UUIDv7, sortable); unknown prefixes are a type error
- **Tests:** integration tests against compose Postgres (unique database or schema per test run); fast-check: TypeIDs round-trip and sort by creation time.
- **Risks/notes:** Drizzle 1.0 RC (Q1): pin exactly, read the changelog before each RC upgrade, move to 1.0 GA when released. Keep `withTenant` free of repositories in P0 (P1.2/P1.3 add them).

### [ ] P0.5a – Server application (est. 4 h)
- **Description:** `apps/server`: Hono app factory (`createApp(deps)`) on `Bun.serve`. Middleware: request ID (`req_` TypeID, honors and echoes `X-Request-Id`), pino logger (`ctx.log`) with redaction of `authorization`, `cookie`, `set-cookie`, `*token*`, `*key*`, `*secret*`, `*password*`; global body limit. `AppError` and the error code catalog in `packages/core/src/errors/codes.ts` with the first codes (`internal_error`, `not_found`, `method_not_allowed`, `validation_failed`, `payload_too_large`); RFC 9457 handler (`application/problem+json`, `type` URL `https://backbricks.app/errors/<code>`, `requestId`, no stack traces). `/healthz` (process up) and `/readyz` (pluggable checks; DB only in P0, DEV-4).
- **Files/packages:** `apps/server/src/{app,server}.ts`, `apps/server/src/middleware/*`, `apps/server/src/health.ts`, `packages/core/src/errors/*`, `packages/core/src/logging/*` (logger type + redaction paths).
- **Depends on:** P0.4, P0.6
- **Reuses:** config (P0.4), db pool (P0.6), `ids` (P0.6).
- **Acceptance criteria:**
  - [ ] Unknown route → 404 problem+json with `code: not_found` and `requestId`
  - [ ] Thrown non-`AppError` → 500 `internal_error`, no stack or message leak; full error in the log
  - [ ] `/readyz` → 503 when Postgres is down, 200 when up
- **Tests:** `app.request()` tests for all of the above; a log-capture test proving redaction of an `Authorization: Bearer bb_sk_…` header and a `token` field.
- **Risks/notes:** Don't add CORS or auth middleware yet (P1.3/P1.9).

### [ ] P0.5b – Process roles (est. 2 h)
- **Description:** Entry point `apps/server/src/main.ts <role>`: `serve` (HTTP), `worker` (DB connection, ready log, idles until shutdown; pg-boss comes in P1.10), `all` (serve + worker in one process), `migrate` (runs P0.6's runner, exits). No `setup` role until P6.2 (DEV-7). Graceful shutdown on SIGTERM/SIGINT: stop accepting, drain in-flight requests (timeout), close the pool, exit 0. Unknown role → usage message and exit code 2.
- **Files/packages:** `apps/server/src/main.ts`, `apps/server/src/roles/*`.
- **Depends on:** P0.5a
- **Reuses:** `createApp`, migration runner.
- **Acceptance criteria:**
  - [ ] Each role starts and stops cleanly on SIGTERM within the timeout
  - [ ] `migrate` exits 0 on success and non-zero on failure
  - [ ] compose `server`/`worker` services from P0.3b use these roles
- **Tests:** spawn tests (`Bun.spawn`) per role: start, wait for the ready log line, send SIGTERM, assert exit code 0.
- **Risks/notes:** Keep role wiring in the app (composition root); no business logic.

### [ ] P0.7 – Dashboard skeleton (est. 5 h)
- **Description:** `apps/web`: Vite 8 + React 19 + TypeScript; Tailwind v4 via `@tailwindcss/vite`; imports `@backbricks/ui/styles.css` and components (shadcn is already initialized in `packages/ui` per ADR-0001, no re-init); TanStack Router (file-based routes via `@tanstack/router-plugin`) and TanStack Query; i18next with `en` and `de` resources and one placeholder page using `@backbricks/ui` components; Vite proxy for `/v1` and `/api` to the server (same-origin cookies later). The server serves the production build (`apps/web/dist`) with SPA fallback for GET requests outside `/v1` and `/api`; static assets get long-lived cache headers, `index.html` gets `no-cache`.
- **Files/packages:** `apps/web/{index.html,vite.config.ts,src/**}`, `apps/web/src/i18n/{en,de}.json`, `apps/server/src/static.ts`.
- **Depends on:** P0.1, P0.5a
- **Reuses:** `@backbricks/ui` (theme, `Button`, `Card`, …), happy-dom test setup from `packages/ui/test/setup-dom.ts` (reference it instead of copying, or move it to a shared spot if both need it).
- **Acceptance criteria:**
  - [ ] `bun run build` produces `apps/web/dist`; the server serves `/` and deep links (`/projects/x`) with `index.html`
  - [ ] `/v1/unknown` still returns a 404 problem+json, not the SPA
  - [ ] All copy goes through i18n keys; `en` and `de` have the same keys
- **Tests:** component test of the placeholder page (happy-dom); a key-parity test for `en`/`de`; server tests for SPA fallback and the `/v1` exclusion.
- **Risks/notes:** shadcn lint rules (`@shadcn/lint`) already apply to app code; use theme tokens, not raw colors.

### [ ] P0.8a – Production Dockerfile (est. 3 h)
- **Description:** Multi-stage `Dockerfile` at the root: install production dependencies (`bun install --frozen-lockfile --production`), build the dashboard, runtime stage `oven/bun:1.4.4-slim` running as the non-root `bun` user, no writes outside `/tmp` (read-only-FS friendly), `ENTRYPOINT ["bun", "apps/server/src/main.ts"]` with the role as `CMD` (default `serve`), `HEALTHCHECK` against `/healthz`, OCI labels incl. license. One image for all roles. `.dockerignore` keeps out `node_modules`, `.git`, `.codegraph`, `.env*`.
- **Files/packages:** `Dockerfile`, `.dockerignore`.
- **Depends on:** P0.5b, P0.7
- **Reuses:** the same lockfile and workspace layout as dev.
- **Acceptance criteria:**
  - [ ] `docker build -t backbricks/server:dev .` succeeds
  - [ ] `docker run --read-only --tmpfs /tmp -e … backbricks/server:dev serve` → `/healthz` 200 and `/` serves the dashboard
  - [ ] `docker run … migrate` applies migrations and exits 0; `id -u` in the container is not 0
- **Tests:** covered by the CI image smoke step in P0.8b.
- **Risks/notes:** Distroless is re-evaluated in P6.6 (OPEN_QUESTIONS D1). Keep `apps/www` out of the image.

### [ ] P0.8b – CI completion and Playwright scaffold (est. 3 h)
- **Description:** Extend `.github/workflows/ci.yml`: `lint:arch` in the quality job (if not added in P0.2), `docker build` with buildx cache (no push), an image smoke step (run `serve` against the compose Postgres, curl `/healthz` and `/`), migrations in the test job before `bun run test`, an `e2e` job with Playwright (browsers cached, Node via mise) running a smoke test (dashboard loads, `/healthz` 200). Playwright config and tests in `e2e/`; `bun run test:e2e` locally against `mise run dev`.
- **Files/packages:** `.github/workflows/ci.yml`, `e2e/playwright.config.ts`, `e2e/smoke.spec.ts`, root `package.json` (`test:e2e`), `turbo.json` if needed.
- **Depends on:** P0.8a
- **Reuses:** `compose.yaml` services (no separate CI service definitions), `jdx/mise-action`.
- **Acceptance criteria:**
  - [ ] CI is green on a PR against `main` with all jobs (quality, test, e2e, image, DCO)
  - [ ] `bun run test:e2e` passes locally
- **Tests:** `e2e/smoke.spec.ts`.
- **Risks/notes:** Agents don't push; the maintainer opens the PR to demonstrate the CI criterion.

### Phase acceptance P0
- [ ] `mise run setup && mise run dev` starts infra, server, worker and dashboard → `docker compose ps` (postgres/garage/mailpit healthy, `deps`/`garage-init` exited 0, server/worker/web running), `curl -fsS localhost:3000/healthz`, `curl -fsS localhost:5173`
- [ ] `bun run check` green (incl. `lint:arch`) → `bun run check`
- [ ] pre-push hook active → `lefthook run pre-push`
- [ ] Docker image serves `/healthz` and the dashboard → `docker build -t backbricks/server:dev . && docker run --read-only --tmpfs /tmp … serve`, then `curl` both
- [ ] CI green on a PR against `main` → PR link (maintainer pushes)
- [ ] CodeGraph index builds → `codegraph init`
- [ ] Forms-only footprint → `BACKBRICKS_MODULES=forms bun apps/server/src/main.ts serve` without S3 variables and without the `storage` profile
- [ ] ADR-0020 written; TS 7 decision recorded
- [ ] Report `docs/progress/phase-0.md`

## Phase P1 – Platform Core (M1) · stub

**Goal:** A multi-tenant platform with every contract in place, no domain modules yet. **Estimate:** 12–15 PD. **Refine with `/bb-plan P1` before execution** (incl. DEV-8).

- [ ] P1.1 – Better Auth in `packages/auth` (email/password, verification, reset, organizations, invitations, cookie flags)
- [ ] P1.2 – Core schema per §B.3 (without module tables) incl. audit trigger
- [ ] P1.3 – `TenantContext` + auth middleware, `requireRole` / `requireScope`, route declaration requirement (I3)
- [ ] P1.4 – API keys (generation, hash storage, scopes/presets, revocation, `last_used_at`, exposure detection I6)
- [ ] P1.5 – Projects API and organization endpoints
- [ ] P1.6 – `ModuleDefinition`, `defineRegistry`, capabilities, `BACKBRICKS_MODULES`, `GET /v1/meta`, single-module boot tests
- [ ] P1.7 – Generic instance service + config-as-code (`dryRun`, diff, `planHash`), JSON Schema export
- [ ] P1.8 – Services and adapters (audit, events, mailer, storage/S3, rate limiter, usage, entitlements, clock, ids)
- [ ] P1.9 – AbuseGuard pipeline, `GET /v1/public/challenge`, CORS for public routes
- [ ] P1.10 – Worker: pg-boss, job registry, outbox dispatcher, cron jobs, graceful shutdown
- [ ] P1.11 – OpenAPI pipeline, `api-contract`, drift and breaking-change checks
- [ ] P1.12 – Dashboard shell (auth pages, org/project switcher, projects, keys, members, activity log)
- [ ] P1.13 – Tenant isolation suite over all management routes

## Phase P2 – Forms (M2 · v0.1.0) · stub

**Goal:** The first module end to end. **Estimate:** 9–11 PD. **Refine with `/bb-plan P2`.**

- [ ] P2.1 – Forms config schema, templates, `validateConfigChange`
- [ ] P2.2 – Runtime validator (config → Zod), normalization, field errors
- [ ] P2.3 – `form_submissions` table + migration
- [ ] P2.4 – Public form schema + submissions (JSON + urlencoded), idempotency, AbuseGuard, events, usage
- [ ] P2.5 – Admin submissions API incl. search, bulk, streamed CSV export
- [ ] P2.6 – Notification rules and content-free sending with throttling
- [ ] P2.7 – Retention purge, `expires_at` recomputation, privacy handler
- [ ] P2.8 – Dashboard "Inbox"
- [ ] P2.9 – Minimal SDK `forms.submit` + PoW; `examples/html`
- [ ] P2.10 – Release `v0.1.0`

## Phase P3 – Uploads (M3 · v0.2.0) · stub

**Goal:** Safe direct uploads with scanning and linking. **Estimate:** 9–12 PD. **Refine with `/bb-plan P3`.**

- [ ] P3.1 – Upload zone config (type presets, size, retention, scan)
- [ ] P3.2 – `files` table + key scheme
- [ ] P3.3 – Public upload intent + `complete`
- [ ] P3.4 – Scan job (copy-then-scan, magic bytes, ClamAV adapter, statuses)
- [ ] P3.5 – `files` capability + forms file fields
- [ ] P3.6 – Admin files API, download URLs, storage usage
- [ ] P3.7 – Orphan cleanup, retention purge, privacy handler
- [ ] P3.8 – Dashboard "Files"
- [ ] P3.9 – SDK `uploads.upload`, example extended
- [ ] P3.10 – Storage contract suite

## Phase P4 – Reviews (M4 · v0.3.0) · stub

**Goal:** Collect, moderate, publish. **Estimate:** 5–7 PD. **Refine with `/bb-plan P4`.**

- [ ] P4.1 – Collection config
- [ ] P4.2 – `reviews` table + migration
- [ ] P4.3 – Public submit, list, stats with caching and field allowlist
- [ ] P4.4 – Admin moderation API
- [ ] P4.5 – Dashboard "Reviews"
- [ ] P4.6 – SDK `reviews.*`, example extended

## Phase P5 – Agent-ready (M5 · v0.4.0) · stub

**Goal:** Scenario A without human help. **Estimate:** 12–15 PD. **Refine with `/bb-plan P5`.**

- [ ] P5.1 – SDK complete (client, errors, retries, PoW worker, size budget)
- [ ] P5.2 – `@backbricks/sdk/admin` (see DEV-8)
- [ ] P5.3 – CLI foundation
- [ ] P5.4 – CLI commands (`login`, `init`, `pull`, `diff`, `push`, `validate`, `codegen`, `test submit`, `keys list`, `docs`)
- [ ] P5.5 – `backbricks doctor`
- [ ] P5.6 – `backbricks mcp` (stdio)
- [ ] P5.7 – Agent docs, docs site (Starlight in `apps/www`), `/errors/*`, `/schema/*`
- [ ] P5.8 – Examples (Next.js, Astro, HTML)
- [ ] P5.9 – Dashboard wizard "Connect an AI agent"
- [ ] P5.10 – Scenario A E2E

## Phase P6 – Open Source 1.0 (M6 · v1.0.0) · stub

**Goal:** Scenario C and a publishable OSS project. **Estimate:** 6–8 PD. **Refine with `/bb-plan P6`.**

- [ ] P6.1 – Production compose (`deploy/compose/`) + `configure` step
- [ ] P6.2 – First-run setup wizard, `system_settings` (adds the `setup` role, DEV-7)
- [ ] P6.3 – `UPLOAD_MODE=proxy`
- [ ] P6.4 – Backup container, restore guide, restore CI job
- [ ] P6.5 – Upgrade path, Changesets, lazy config migration job
- [ ] P6.6 – Hardening (headers, CSP, login rate limits, `bun audit`, threat model)
- [ ] P6.7 – Release engineering (SPDX, license check, GHCR, npm provenance)
- [ ] P6.8 – Scenario C test + minimal-footprint runs

## Phases C1–C3 – Managed cloud (after M6) · coarse

**Estimate:** C1 7–9 PD, C2 5–7 PD, C3 3–5 PD. Planned in detail only after M6.

- [ ] C1.1 – `DEPLOYMENT_MODE=cloud`: open sign-up, onboarding, disposable-email check
- [ ] C1.2 – `cloud/` package: plans, `PlanEntitlements`, enforcement, usage page
- [ ] C1.3 – Metering jobs
- [ ] C1.4 – RLS on all tenant tables, roles, tests
- [ ] C1.5 – Hetzner (DE) infrastructure, PITR backups, deploy pipeline
- [ ] C2.1 – Billing adapter
- [ ] C2.2 – Monitoring, error tracking, alerting, runbooks
- [ ] C2.3 – Restore drill, load test
- [ ] C2.4 – Legal drafts, closed beta
- [ ] C3.1 – Legal sign-off, status page, public launch
- [ ] C3.2 – Optional remote MCP with OAuth 2.1
- [ ] C3.3 – Scenario D E2E on production

## Risk register

| # | Risk | Phase | Mitigation | Status |
|---|---|---|---|---|
| R1 | TS 7 has no JS compiler API; dependency-cruiser, openapi-typescript and the Better Auth CLI may fail | P0.2, P0.9b, P1.11 | Decision rule: tool-local fallback first, repo-wide TS 6.0.3 as last resort (DEV-6, ADR-0020) | open |
| R2 | Bun's isolated linker + bind mount: per-package `node_modules`, darwin vs. Linux binaries | P0.3b | Named volume per workspace, in-container install (`deps`), volume sync test | open |
| R3 | Garage image has no shell; admin API v2 details | P0.3a | Bun init script, pinned v2.5.0, idempotency test | open |
| R4 | Better Auth (`auth` CLI) and pg-boss declare `node >=22.12`; runtime issues on Bun | P0.9a | Spike before use; fallback: run the worker role or CLI on Node (ADR) | open |
| R5 | Drizzle 1.0 RC: breaking changes between RCs or before GA | P0.6, P1.1 | Exact RC pin (Q1); spike in P0.9a; changelog review before upgrades; fallback 0.45.4 possible until the first real migration | open |
| R6 | P0 over budget (~1 PD), tooling overhead (ARCHITECTURE J.1 #10) | P0 | DEV-4/DEV-7 keep P1 work out of P0; spike is time-boxed | open |
| R7 | ClamAV: arm64 only in `-debian` images; 1.5–2 GB RAM | P0.3a, P3 | `-debian` tag, profile `scan` | open |
| R8 | File watching across the macOS bind mount | P0.3b | Polling options, documented | open |
| R9 | Garage may not enforce signed `Content-Length` on presigned PUTs | P0.9b, P3 | Verified in the spike; fallback design before P3 (ADR) | open |
