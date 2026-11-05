# ADR-0020: Library compatibility on Bun and TypeScript 7

- **Status:** accepted
- **Date:** 2026-11-05
- **Related:** ADR-0003 (TypeScript 7 and Bun), ADR-0007, ADR-0008, ADR-0009, ADR-0010, ADR-0012, ADR-0013, ADR-0014; ARCHITECTURE §H, §J.1 #10; PLAN P0.2, P0.9a, P0.9b, risks R1, R4, R9; OPEN_QUESTIONS D0

## Context

ARCHITECTURE §J.1 #10 lists toolchain maturity as a risk: Bun compatibility of the libraries, and TypeScript 7, whose npm package has no classic JavaScript compiler API. PLAN P0.9 verifies every library the next phases depend on before code is built on it, and applies the TypeScript 7 decision rule (tool-local fallback first, repo-wide TypeScript 6 only as a last resort).

The checks ran on 2026-11-04/05 on macOS arm64 with Bun 1.4.4, Node 24.22.1 and the compose services (Postgres 18.6, Garage v2.5.0), in a throwaway project. Only this record is kept.

## Decision

**TypeScript 7 stays.** Every tool that needs the old compiler API has a fallback local to that tool; DEV-6 (repo-wide TypeScript 6) is not needed. All libraries below work on Bun with the settings listed.

| Library (version) | Result | What was checked | Settings and follow-ups |
|---|---|---|---|
| dependency-cruiser 18.7.2 | works with fallback | Parses `.ts`/`.tsx` with `parser: "swc"` (`@swc/core` 1.16.21), including type-only imports; `typescript >=7` is not supported | `tsPreCompilationDeps` stays off (it needs the TS compiler and only causes a warning). Runs through its Node shebang (P0.2). |
| drizzle-orm / drizzle-kit 1.0.0-rc.5 | works | `drizzle-kit generate` on Bun writes the 1.0 format (`migrations/<timestamp>_<name>/migration.sql` + `snapshot.json`, no journal); `migrate()` with `pg`; transactions; `select set_config('app.org_id', $1, true)` is visible inside the transaction and empty after it | **The migrator takes no lock:** two parallel runs without a lock failed (`duplicate key … pg_namespace_nspname_index`). The runner (P0.6) holds `pg_advisory_lock` on one dedicated `pg.Client` and passes that same client to Drizzle. |
| pg 8.23.1 | works | Pool and Client on Bun | One driver for Drizzle, pg-boss and Better Auth. |
| pg-boss 12.38.0 | works | start, `createQueue`, `send`, `work`, `schedule`, graceful `stop` (27 ms) on Bun | `fromDrizzle(tx, sql)` enqueues inside a Drizzle transaction: a committed job was delivered, a rolled-back one was not. This covers "enqueue in the same transaction" (ARCHITECTURE §A.4) without a custom outbox shim. |
| better-auth 1.7.17 + CLI `auth` 1.7.16 | works with fallback | Drizzle adapter on Drizzle 1.0 RC, email/password sign-up, organization plugin (`createOrganization`), `auth.handler` for `/api/auth/*`; session cookie `HttpOnly; SameSite=Lax` | (1) Call the CLI as `bun run auth generate …`; `bun auth` is a reserved Bun subcommand. (2) The generated schema imports `relations` from `drizzle-orm`, which Drizzle 1.0 moved to `drizzle-orm/_relations`; P1.1 rewrites that import after generating. (3) Telemetry is off unless `BETTER_AUTH_TELEMETRY=true` or the config enables it; P1.1 sets `telemetry: { enabled: false }` explicitly. (4) `Secure` comes from an HTTPS base URL or explicit cookie settings (P1.1). |
| @aws-sdk/client-s3 + s3-request-presigner 3.1161.0 vs. Garage v2.5.0 | works with setting | Presigned PUT with signed `Content-Length` and `Content-Type`: oversized, undersized and wrong-type uploads → `403 AccessDenied`, exact upload → `200`; `HeadObject`, `CopyObject`, `DeleteObject`; a second PUT to the old URL after copy changes only the staging key, the final copy is unaffected; presigned GET with `ResponseContentDisposition=attachment` and `ResponseContentType=application/octet-stream` | **Set `requestChecksumCalculation: 'WHEN_REQUIRED'`** (and `responseChecksumValidation: 'WHEN_REQUIRED'`) on the S3 client. The SDK default adds an `x-amz-checksum-crc32` of an empty body to presigned URLs, and Garage then rejects the real upload with `400 InvalidDigest`. Sign with `signableHeaders` and `unhoistableHeaders` = `content-length`, `content-type`. CORS is set with S3 `PutBucketCors` (Garage's admin API has no CORS setting). |
| altcha-lib 2.8.0 | works | v2 API: `createChallenge` / `solveChallenge` / `verifySolution` with `deriveKey` from `altcha-lib/algorithms/sha`; HMAC signature; tampered parameters, wrong secret and expired challenges are rejected | Cost 1000 solves in ~90 ms on an M-series Mac; tune in P1.9. Replay protection (`pow_challenges_used`) is ours to build. |
| @modelcontextprotocol/sdk 1.32.2 | works | `McpServer.registerTool` with a Zod input schema over `StdioServerTransport`; a stdio client lists and calls the tool with the server running on Bun and on Node 24 | `registerTool` replaces the deprecated `tool()` overloads. |
| openapi-typescript 7.13.0 | works with fallback | Fails with TypeScript 7 (`ts.factory` is undefined). With `typescript@5.9.3` as a devDependency of the generating package, Bun's isolated linker resolves 5.9.3 for that package while the root keeps 7.0.2, and generation succeeds | P1.11 adds `typescript@5.9.3` to `packages/api-contract` only. |
| oxlint 1.91.0 + oxlint-tsgolint 7.0.2005 | works | Type-aware rules (e.g. `no-floating-promises`) fire on the TS 7 project | – |

## Consequences

- No repo-wide TypeScript downgrade. The lockfile carries TypeScript 5.9.3 next to 7.0.2 once P1.11 lands (codegen only), plus `@swc/core` for dependency-cruiser.
- Settings that must not get lost are listed above and repeated in the PLAN tasks that use them (P0.6, P1.1, P1.8, P1.11).
- Risks R1 (TypeScript 7 tooling), R4 (Better Auth and pg-boss on Bun) and R9 (signed `Content-Length` on Garage) are resolved for the current versions. Library upgrades can change this; the storage contract suite (P3.10) and the integration tests keep the S3 and database behavior under test.
- Running the worker on Node (the R4 fallback) isn't needed.

## Alternatives considered

- **Repo-wide TypeScript 6.0.3 (DEV-6):** would have made dependency-cruiser and openapi-typescript work without fallbacks, but gives up TS 7's speed for two tools that work fine with local fallbacks. Rejected for now; still the documented fallback if a future tool can't be handled locally.
- **Drizzle 0.45.4:** no blockers found with 1.0 RC (OPEN_QUESTIONS Q1), so the RC stays.
- **`Bun.S3Client` instead of the AWS SDK:** not tested here; it may replace the SDK behind `StorageAdapter` once the storage contract suite passes with it (ADR-0009).
