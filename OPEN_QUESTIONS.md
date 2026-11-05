# Open questions

Decisions the maintainer needs to make, from the planning run `/bb-plan P0` (2026-11-04). Answer inline under each question. Each lists a recommendation and the latest task by which the answer is needed. Later runs add questions here; execution runs add their own choices under "Decided, please confirm".

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
- **Context:** `PLAN.md` → "Proposed deviations": DEV-1 (no `packages/tsconfig`), DEV-2 (internal packages as TS source), DEV-3 (`ids` and tenancy types in core), DEV-4 (`/readyz` DB-only in P0), DEV-5 (env lint rules), DEV-7 (no `setup` stub in P0). DEV-6 only applies if the TypeScript 7 decision rule triggers it; DEV-8 is decided at `/bb-plan P1`.
- **Recommendation:** accept all six.
- **Needed by:** start of P0.
- **Answer (2026-11-05):** Accepted: DEV-1, DEV-2, DEV-3, DEV-4, DEV-5, DEV-7.

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
