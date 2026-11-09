# Phase P0 – Foundation (M0): report

- **Branch:** `feat/p0-foundation` (13 commits, not pushed)
- **Date:** 2026-11-05
- **Status:** all 13 tasks done. Every M0 exit criterion is demonstrated locally except "CI green on a PR", which needs a push.

**Post-merge update (2026-11-06):** [PR #4](https://github.com/nolliebigspin/backbricks/pull/4) merged on 2026-11-06 with successful quality/build, tests, Playwright, image and DCO checks (verified during P1 planning). The remaining CI criterion is satisfied. The original report below describes the pre-push state on 2026-11-05; its CI gap and push/PR next step are historical, not current blockers.

## Done

| Task | Result |
|---|---|
| P0.1 | Package shells for every package in ARCHITECTURE §G.1, MIT `LICENSE` + `engines.node >=20` for sdk/cli, a test that checks every workspace against LICENSING.md |
| P0.2 | `bun run lint:arch` (dependency-cruiser, 12 rules for I13, I18, ADR-0001, no deep/relative/circular imports, no undeclared or dev deps in server code) in `check`, pre-push and CI; fixture tests prove each rule fires; oxlint bans `process.env`/`Bun.env` outside the config (DEV-5) |
| P0.3a | `compose.yaml` infra: Postgres 18.6, Garage v2.5.0 + idempotent `garage-init` (profile `storage`), Mailpit, ClamAV 1.5.4-debian (profile `scan`, arm64) |
| P0.3b | App services `migrate` → `server` + `worker`, and `web` (Vite HMR), per-workspace `node_modules` volumes with a sync test; forms-only runs without the storage profile |
| P0.9a/b | Library spike on Bun 1.4.4 and TS 7; results and required settings in ADR-0020. TS 7 stays |
| P0.4 | Zod config in core, composed from the enabled modules' infrastructure declarations; `*_FILE`; errors without values; `.env.example` tested against the schema |
| P0.6 | `packages/db`: pool + Drizzle 1.0 RC, migration runner with advisory lock (tested with parallel runs), `withTenant` skeleton; TypeIDs, Clock and tenancy types in core |
| P0.5a | Hono app: request IDs, pino with name-based redaction, RFC 9457 problem details, body limit, `/healthz`, `/readyz` |
| P0.5b | Entry point with roles `serve`, `worker`, `all`, `migrate`, graceful shutdown, exit on invalid config; spawn tests per role |
| P0.7 | Dashboard SPA (Vite 8, React 19, TanStack Router/Query, shared `packages/ui`, i18next en/de); served by the server with SPA fallback that never covers `/v1` or `/api` |
| P0.8a | Multi-stage production Dockerfile, one image for all roles, non-root, read-only file system, 248 MB |
| P0.8b | CI jobs `image` (build + smoke test) and `e2e` (Playwright); `bun run test:e2e` |

## Evidence (commands run on 2026-11-05)

| M0 exit criterion | Command | Result |
|---|---|---|
| `mise run setup && mise run dev` starts infra, server, worker and dashboard | `mise run setup`, then `SERVER_PORT=3100 mise run dev`, `docker compose --profile storage ps -a` | postgres, garage, mailpit healthy; deps, garage-init, migrate exited 0; server healthy, worker and web running. `/healthz` and `/readyz` 200, dashboard `<title>Backbricks</title>` on :5173, Vite proxy to `/readyz` 200; logs show `migrations applied`, `serve ready`, `worker ready` |
| Forms-only footprint | `BACKBRICKS_MODULES=forms docker compose up -d server worker` | only postgres + app containers; `/readyz` 200; server logs `"modules":["forms"]` |
| `bun run check` green | `mise run infra && bun run check` | exit 0; no dependency violations; 80 package tests + 83 script tests, 0 failed, 0 skipped |
| pre-push hook runs | `lefthook run pre-push` | `✔️ check` |
| Docker image serves `/healthz` and the dashboard | `docker build -t backbricks/server:dev .`, `docker run --read-only --tmpfs /tmp … serve` | `/healthz` 200, `/` serves the dashboard; `migrate` exits 0; uid 1000; `serve` and `worker` exit 0 on SIGTERM |
| E2E | `bun run build && bun run test:e2e` | 4 passed (dashboard en/de, deep link, health and problem details) |
| CodeGraph index builds | `codegraph init`, `codegraph status` | "Index is up to date" |
| CI green on a PR against `main` | – | **open**: needs a push and a PR by the maintainer |

## Deviations from PLAN.md

- **P0.3b ran after P0.7**, once the apps existed, instead of adding placeholder services. No `docker/dev.Dockerfile`: the dev services use `oven/bun:1.4.4` directly. A `migrate` one-shot was added before `server`/`worker`.
- **No 405 `method_not_allowed`** (P0.5a): Hono doesn't distinguish a wrong method from a missing route; unknown combinations return 404 until the API routes exist. P1.11 can derive 405 from the OpenAPI route table.
- **No `HEALTHCHECK` in the image** (P0.8a): it would apply to every role, and `worker`/`migrate` serve no HTTP. Compose defines it per service.
- **No empty initial migration** (P0.6): tests use fixture migrations; the real history starts with P1.1/P1.2. `bun run db:generate` reports "no schema files" until P1.2 adds `packages/db/src/schema`.
- **Own TypeID encoder** instead of `typeid-js` (~60 lines on Web Crypto, checked against the spec's test vectors, testable with an injected clock).
- **Error signature:** `new AppError(code, { detail, errors, hint })` with the status taken from the code catalog; AGENTS.md §5 is updated to match.
- **Playwright** starts the real `serve` role with the built dashboard (port 3300) instead of testing against `mise run dev`, so local and CI runs are identical.
- **No pino-pretty:** logs are JSON everywhere; pipe through `bunx pino-pretty` locally (avoids a dependency in the image).
- `BACKBRICKS_MODULES` unset **or empty** means all modules (Compose passes empty values).

These are also listed in OPEN_QUESTIONS.md under "Decided, please confirm" (D7–D12).

## Known gaps

- **CI has never run** on this branch. The new jobs (`image`, `e2e`) were checked locally (the smoke script ran under bash), but GitHub-specific parts (buildx gha cache, `playwright install --with-deps`) are only verified in CI.
- **`import.meta.env` can't be banned:** oxlint has no `no-restricted-syntax`, and Bun exposes env vars through `import.meta.env` too. Only review catches it for now.
- **Storage endpoint for browsers:** the dev server reaches Garage at `http://garage:3900`, but presigned URLs must use a browser-reachable host (`http://localhost:3900`). P1.8 needs separate internal and public S3 endpoints.
- **Linux hosts:** dev containers run as root, so files they generate (TanStack route tree, migrations) are root-owned on Linux. On macOS (OrbStack, Docker Desktop) they belong to the user.
- **`.env.local` in the repo root:** Bun loads it automatically for every `bun` command on the host, including `bun run check`. Spawned test processes use `--no-env-file`; other tests read only explicit variables. Keep app variables out of that file, or the host runs pick them up.
- **Existing CI actions** (`checkout@v5`, `cache@v4`, `mise-action@v3`) are behind their current majors; Dependabot will propose the bumps. New actions use current majors.

## New risks

| # | Risk | Mitigation |
|---|---|---|
| R10 | Port 3000 is often taken on developer machines (it is on the maintainer's: another project's Next.js server) | Compose ports are overridable (`SERVER_PORT`, `WEB_PORT`, …); E2E uses 3300 |
| R11 | Drizzle 1.0 is still a release candidate (R5): RC upgrades can change behavior the migration runner relies on | Exact pin; the parallel-migration test fails if locking breaks |
| R12 | `dependency-cruiser` runs with swc while TS 7 is unsupported; a dependency-cruiser update could change parsing | Fixture tests in `scripts/arch` fail if a rule stops firing |

## Next

1. Push `feat/p0-foundation`, open a PR against `main` and confirm CI is green (last M0 criterion).
2. Confirm D7–D12 in OPEN_QUESTIONS.md.
3. Optional: `/bb-review P0` in a fresh session.
4. `/bb-plan P1` to refine phase P1 (incl. DEV-8), then `/bb-phase P1`.
