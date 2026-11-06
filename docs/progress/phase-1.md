# Phase P1 – Platform Core (M1): report

- **Branch:** `feat/p1-platform-core`; signed-off commits; PR-based review against `main`.
- **Date:** 2026-11-06.
- **Status:** All 39 M1 tasks are implemented. The maintainer explicitly approved Q11; production publishable authentication is wired and the local owner/image/security evidence is complete. Merge acceptance still requires green PR CI and maintainer/fresh-session review.

## Delivered

| Area | Result/source |
|---|---|
| Identity | Verified email/password accounts, reset/logout, organization roles and invitations through a closed Better Auth surface; same-transaction audit and durable mail. [ADRs](../adr/README.md) 0021–0028 define the boundaries. |
| Tenant platform | Scoped repositories, immutable principals, declared route access and real isolation fixtures; bounded audit/outbox/usage and project archive lifecycle. |
| Keys | CSPRNG publishable/secret material, SHA-256 storage, explicit scope presets, session-only creation, revocation/expiry and exposure audit/notification intent. Both secret and publishable bootstrap factories are live under the explicitly approved Q10/Q11 boundary ([ADR-0054](../adr/0054-publishable-key-authentication-bootstrap.md)). |
| Modules/config | Optional registry/capabilities, infrastructure selection, generic instances, immutable revisions, migration/rollback and signed plan/atomic apply. Synthetic test modules prove the framework; production forms/uploads/reviews remain descriptors until M2–M4. |
| Providers/workers | Private S3 signing/I/O, SMTP, ALTCHA/replay, shared Postgres limiter, transactional pg-boss jobs, durable outbox/mail and bounded maintenance. No production domain feature is invented for M1. |
| Contract | Offline deterministic OpenAPI and TS generation, MIT admin client, non-destructive drift checks and pinned offline oasdiff against the actual base commit; authorization-safe 405 handling. ADRs 0051/0052. |
| Dashboard | Account flows, session gate, organization/project switching, project/domain settings, reveal-once keys, invitations/roles/removal and paginated safe activity, all en/de. [ADR-0053](../adr/0053-dashboard-account-boundary.md). |
| Shipping | Updated isolated image package copies and direct auth Zod declaration. The shared [image smoke](../../scripts/image/smoke.ts) creates a disposable database, migrates, serves the built dashboard, verifies private/non-root/read-only roles, observes a real cleanup job consumed by the image’s worker and checks graceful shutdown. CI invokes the same smoke. |

## Acceptance evidence

All commands below passed on 2026-11-06 against real compose services. No service skip is counted as proof.

| Criterion | Command / evidence | Result |
|---|---|---|
| Full quality | `bun run check` | Passed: formatting, lint, architecture, both API gates, typecheck, 258 package tests and 92 script tests; zero failures/skips. |
| All build artifacts | `bun run build` | Passed: dashboard, website and SDK builds, all three tasks executed without cache. |
| Fresh service/security/optionality suites | `CI=true bunx turbo run test --force` | Passed: 258 package tests (79 core, 44 db, 109 server, 7 adapters, 7 UI, 11 web, 1 SDK), zero failures/skips; all seven test tasks ran without cache. |
| Owner workflows | `CI=true bun run test:e2e` | Passed: all 10 tests, no retries/skips, including complete en/de owner journeys, production publishable challenge/revocation and visible audit pagination. |
| Contract generation/drift | `bun run api:generate && bun run api:check`; `git diff --exit-code -- packages/api-contract` | Passed; committed contract artifacts remained unchanged after regeneration. |
| Compatibility gate | `bun run api:breaking` and breaking/drift negative fixtures | The actual local merge-base has no pre-M1 contract, so bootstrap is expected. Fixtures prove additive changes pass, removal/type changes and missing history fail, and regeneration cannot bypass comparison. Passed in the final check and standalone rerun. |
| Production image | `docker build -t backbricks/server:m1 .`; `bun scripts/image/smoke.ts` | Passed on Linux arm64 with disposable real Postgres. Local arm64 image: approximately 368 MiB. No registry push. |
| SDK runtime floor | Existing SDK HTTP/import test under Bun and Node 24; additional Node 20 probe | Passed on Node 20.20.2 via `mise exec node@20.20.2 -- bun run --cwd packages/sdk test`: the built public admin entry performed a real HTTP request and preserved structured errors. The default Node 24/Bun checks also passed. |

The fresh credential matrix exercises all **36 mounted management methods** in the synthetic operational-module runtime: 24 `/v1` methods and 12 guarded organization methods. The production subset is 15 `/v1` plus those 12 organization methods; the nine extra `/v1` methods are generic instance operations. Runtime manifests drive coverage, not this report’s counts. Malformed/revoked keys are rejected, publishable keys cannot authenticate management operations, and explicit `/v1` bearer credentials never fall back to a valid cookie. The existing case suite also proves roles/scopes, foreign organizations, sibling-project binding, nested ID mismatches, collection non-disclosure and denied-write snapshots. Raw library endpoints outside the approved manifest return 404.

Browser acceptance covers signup/verification/reset through local Mailpit, a second invited browser, last-owner protection, promotion/removal, key reveal/clipboard denial/navigation/session expiry, revocation enforcement, stale-response organization switching, mobile layout, origin normalization/empty-list acknowledgement, foreign-origin exposure and safe visible audit pagination. Query-cache tests prove creation tokens never enter query/mutation caches. Component/server tests cover the authorized no-SMTP invitation fallback and expired/canceled/wrong-identity invitations.

## Findings resolved during acceptance

- The first GitHub image smoke failed because that job installed dependencies only inside Docker. The host smoke imports workspace test helpers, so the image job now performs its own frozen host install before invoking the smoke.

- The M0 Dockerfile omitted the new SDK build source and auth/adapter runtime sources. The first isolated build failed; the subsequent runtime smoke exposed auth’s missing direct Zod dependency. Both are fixed, with the existing pinned Zod version. Workspace hoisting is not used to hide the dependency.
- The exposure outbox event and audit action have distinct names. The dashboard now translates the actual `key.exposed` audit action; en/de browser tests require it to appear.
- Expired, unrevoked keys previously displayed “Active.” A failing component regression preceded the fix; the key list now uses the shared display-only browser clock. Server expiry enforcement remains authoritative.
- Explicit language selection persists only the language code across navigation. No authentication/reset/key material is persisted.
- Isolation snapshot revision reads now run sequentially on their single physical transaction connection instead of issuing concurrent driver calls.
- E2E uses explicit open signup/local SMTP and synthetic per-test proxy addresses, trusted only by the local E2E server, so parallel workflows exercise independent rate-limit identities. Production trust/default signup policy is unchanged.

## Remaining gates and risks

1. Q11 was explicitly approved on 2026-11-06 and implemented in [ADR-0054](../adr/0054-publishable-key-authentication-bootstrap.md). Real database tests cover exact matching, fixed kind, IDs-only output, expiry/revocation/archive and scoped stale-candidate rejection; en/de browser journeys exercise production publishable challenge access and revocation.
2. All implementation tasks are complete; there is no pending public-auth implementation gate. The approved exception remains limited to exact hash/active kind/project/IDs-only discovery.
3. Green remote CI and review are required before merge and tracked on the feature-branch PR; local arm64 image evidence alone does not claim an amd64 GitHub runner result.
4. A different fresh session must perform the phase review under AGENTS §9. This implementing chat has not issued a phase-review report.
5. M2 still owns forms/personal-data erasure orchestration; M3 owns file scanning/upload workflows. No incomplete domain feature or personal erasure endpoint is claimed as M1 functionality.

## Resume

Review the feature-branch PR and obtain green CI before merging. A fresh session can perform the phase review under AGENTS §9. All implementation tasks are complete; proceed to M2 planning only after milestone acceptance. No merge or main-branch push is authorized.
