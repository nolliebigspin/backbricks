# Phase P1 – Platform Core (M1): review

- **PR:** [nolliebigspin/backbricks#6](https://github.com/nolliebigspin/backbricks/pull/6), `feat/p1-platform-core` → `main`, 46 commits, 439 files, +40.6k / −0.7k.
- **Date:** 2026-11-09.
- **Reviewer:** a fresh session that did not implement P1 (AGENTS §9). Core, auth and server routes were reviewed in depth. Web, tests and docs/config were reviewed by parallel read-only subagents, and their key findings were spot-checked.
- **Code changed:** none.

## Verdict

**I found no critical issue and no invariant violation.** Tenancy (I1/I2), key handling (I4/I6/I7), the route-declaration gate (I3) and same-transaction audit (I12) are all built carefully and tested well. One issue in the shared public request pipeline should be fixed **before M2 ships the first production public write route**: the forms module. The remaining findings are test gaps, a UX data-loss risk, deployment hardening and housekeeping. None blocks merging M1 if H1 is tracked as an M2 prerequisite.

## Evidence

| Check | Result |
|---|---|
| `format:check`, `lint`, `lint:arch`, `api:check`, `api:breaking`, `typecheck` (run locally) | Passed |
| Package, script and E2E tests | **Not run locally:** Docker/OrbStack was down, so integration tests would skip (D10). PR CI ran them against real services: *Tests*, *End-to-end (Playwright)*, *Docker image* and *DCO sign-off* are green. |

## Findings

### High

**H1 – A single client can exhaust a tenant's public write budget (and the global one).**
- **Location:** `packages/core/src/abuse/guard.ts:103-129`, plus the order of `origin()` at line 130.
- **Scenario:** all four buckets (per IP+instance per minute and per hour, per project at 600/min, global at 100k/min) are consumed in parallel with `Promise.all`, and before the origin check. A request the per-IP bucket has already denied still increments the project and global counters.
  - One IP holding the project's publishable key, which is public by design because it ships in the site, can send about 600 requests per minute and lock every visitor out of that project's forms.
  - Requests from a disallowed origin burn the budget too.
  - On the managed cloud, about 1.7k requests per second from a few IPs exhausts the global bucket for all tenants.
- **Impact today:** M1 mounts only synthetic or test public routes, so this cannot be exploited in production yet. It becomes exploitable when M2 mounts forms.
- **Fix:**
  - Run the cheap identity checks first: credential, then origin.
  - Consume buckets narrowest first, one after another, and stop at the first denial so a rejected request never increments the wider buckets.
  - Consider making the global bucket a protection against overload, not a hard failure for everyone.
  - Add a regression test: N denied requests from one IP leave the project bucket untouched.

### Medium

**M1 – The reveal-once secret can be lost by an accidental Escape or click outside.**
- **Location:** `packages/ui/src/components/key-reveal-dialog.tsx:36-42`; used in `apps/web/src/dashboard/embed.tsx` and `members.tsx`.
- **Scenario:** the Radix `Dialog` calls `onClose` on Escape or a backdrop click, and `onClose` nulls the token. A secret key is shown only once (I4/I7), so the user has to create a new key. The no-SMTP invitation link has the same problem.
- **Fix:** add `onEscapeKeyDown` and `onInteractOutside` handlers that call `preventDefault()`, so only the explicit close button dismisses the dialog. Add a component test.

**M2 – Auth rate limits are per IP only, and the proxy trust list is empty by default.**
- **Location:** `packages/auth/src/dashboard-auth.ts:59-80`; `.env.example:26` (`TRUSTED_PROXIES=`); ARCHITECTURE §721 (Caddy in front).
- **Scenario 1:** behind any reverse proxy with no `TRUSTED_PROXIES` set, every user has the proxy's IP hash. The 10/min credential bucket is then shared by everyone, so one attacker blocks sign-in and password reset for the whole installation.
- **Scenario 2:** with the proxy configured correctly, there is no per-account limit. Credential stuffing against one email from rotating IPs is limited only per IP, and so is reset-mail flooding of one inbox.
- **Fix:**
  - Add a per-account bucket for sign-in, reset and verification, keyed by an HMAC of the normalized email.
  - Log a startup warning, or fail readiness in production, when the server sees forwarded headers but has no trusted proxies.
  - Cover this in the P6 deploy docs.

**M3 – The isolation suite probes management routes with session cookies only.**
- **Location:** `apps/server/test/isolation/*-cases.ts`.
- **Scenario:** the suite enumerates every mounted management route automatically, but only with owner cookies. Foreign-project 404s for project-bound secret keys are covered by hand-picked tests (`projects.keys.test.ts`, `authorization.keys.test.ts` on fixture routes). A future route with a `secretKey` policy could skip key scoping and no test would fail.
- **Fix:** for every case whose route declares `secretKey`, also run the probe with a project-A key, expecting 404 on project-B and sibling resources.

**M4 – No automatic I5 check for public responses.**
- **Location:** `apps/server/src/tenant-isolation.test.ts:23-27` covers `kind: 'management'` only.
- **Scenario:** public responses are snapshot-tested ad hoc (`challenge.test.ts`, `module-routes.test.ts`). A new public route that returns a private field fails nothing. This matters most from M2 onward.
- **Fix:** add a manifest-driven test, parallel to `assertIsolationCoverage`. Every `kind: 'public'` operation must have a field-allowlist or snapshot case, or the test fails.

**M5 – I12 rollback tests miss some mutations.**
- **Missing entirely:** `invitation.cancel` (`invitations.test.ts:204` covers only the happy path).
- **Partial:** config apply (`configuration.apply.test.ts:78`) and `instance.migrated` (`instance-versions.test.ts:68`) force a failure only in `events`, not in `audit_logs`.
- **Fix:** add cancel to the CHECK-constraint loop in `organizations.transactions.test.ts`, and run the apply and migration cases against both tables, as `keys.test.ts` does.

**M6 – Decisions not listed for maintainer confirmation.**
- **Location:** `OPEN_QUESTIONS.md:133,137`.
- **Problem:** there are two entries labelled "D33" (ADR-0043 and ADR-0046). ADRs 0045, 0047, 0048, 0049, 0050, 0051, 0052 and 0053 have no "Decided, please confirm" entry, which AGENTS §9 requires.
- **Fix:** renumber the second entry and add entries for those ADRs, so the maintainer can confirm them in one pass.

### Low

- **L1 – An admin can create a pre-verified account for any address they invite.** `packages/auth/src/organizations/invitation-signup.ts`, `packages/auth/src/options.ts:83`. Invite-bound signup marks the email verified on the strength of the invitation ID, which the inviting admin can see (list-invitations, or the no-SMTP link). An admin can therefore register `someone@corp.com` with a password of their choice. Mitigations: the account is useful only in that organization, other organizations' invitation IDs are not discoverable, and the real owner can reset the password, which revokes sessions. Record this trade-off in ADR-0027, or require email verification before access to a second organization.
- **L2 – Public read routes have no rate limit.** `guard.ts:96-101`: the `access.kind === 'read'` branch skips every bucket. No production read route exists yet; reviews arrive in M4. Decide before M4.
- **L3 – No direct test that the sole owner cannot be removed** (only concurrent demotion is tested, in `organizations.transactions.test.ts`). The guard itself is correct (`operation.ts:86-91`).
- **L4 – Hand-written SQL that the Drizzle schema doesn't declare:** the `audit_logs_immutable` trigger, `member_organization_user_unique`, the expiry indexes on auth tables, and the UNLOGGED buckets, in migrations `20261106024528_*` and `20261106124449_*`. Add a header comment and a schema-integrity assertion so a later `db:generate` can't drop them silently.
- **L5 – Repeated retention literals:** `3600` and `86_400` in `jobs/tenant-maintenance.ts`, `jobs/platform.ts`, `db/src/queue-schedules.ts` and `delivery.ts`. Add `SECONDS_PER_HOUR` and `SECONDS_PER_DAY` next to `MILLISECONDS_PER_DAY`.
- **L6 – Dashboard polish:**
  - The organization selector has a selectable empty option (`shell.tsx:54`).
  - The `signOut` error is ignored (`shell.tsx:70-76`).
  - Any membership error shows "access lost" (`shell.tsx:90-96`).
  - The project switcher shows only the first 50 projects (`project-shell.tsx:28-45`).
  - The session-expired redirect drops the query string (`shell.tsx:34`).
  - `window.location.pathname` is checked instead of using router state (`shell.tsx:84`).
  - Two raw `<select>` and checkbox elements duplicate `packages/ui`.
- **L7 – Test hygiene:**
  - Stale "P1.4c" comment and a fixture resolver in `authorization.keys.test.ts:25-27`.
  - Negative timing assertion with `Bun.sleep(30)` in `packages/db/src/queue.test.ts:172`.
  - Isolation 404 bodies are not checked for the foreign ID (`suite.ts:80-88`).

## Verified clean (with locations)

- **I1 tenancy:**
  - `createWithTenant` (`packages/db/src/with-tenant.ts`) binds the org/project settings, rechecks the project's ownership and archive state, and invalidates escaped handles.
  - Repositories always apply `scope.where` (`repositories/scope.ts`).
  - The bootstrap exception returns IDs only, with a fixed kind (`credential-bootstrap.ts`), and is followed by a scoped `findByHash` recheck (`keys/authentication.ts:51`, `public-auth.ts:33`).
- **I2:** cross-tenant org, project and key mismatches all return `not_found` (`management-authorization.ts:57-62, 87-104`).
- **I3:** `ApiRoutes` rejects undeclared or raw handlers at runtime (`http/api-routes.ts:142`). Authorization runs before body parsing, and 405 responses inherit the path's policy.
- **I4/I6/I7:**
  - SHA-256 storage, reveal on create only (`keys/service.ts`), and key metadata responses use `apiKeyMetadataSchema`, never the record.
  - Exposure detection is audited and committed before the 403, with throttled notification (`keys/authentication.ts:56-94`).
  - Key management is session plus admin only, with a double check (`keys/service.ts:15`).
  - Publishable keys can't authenticate management operations.
- **CSRF:** unsafe session requests need an exact `Origin` plus the `X-Backbricks-CSRF` header. Cross-site fetch metadata is rejected for both management and auth.
- **Auth surface:** closed endpoint allowlist (`packages/auth/src/http.ts`), callback URLs checked against the origin (including backslash and protocol-relative tricks), tokens stripped from JSON responses, and tokenized auth paths logged as route templates only.
- **Organization guards:** owner-only targets, no owner grants, last-owner protection, and an org lock against races (`operation.ts`).
- **Signed config plans:** HMAC with a derived key, `timingSafeEqual`, expiry and digest binding (`configuration/plan-token.ts`).
- **I8:** no `dangerouslySetInnerHTML` or `innerHTML`. Reveal tokens live only in component state, never in the query cache, storage or URLs. `safeRedirect` blocks open redirects.
- **I11/I12:** expiry columns and indexes on every transient or personal table, an audit immutability trigger, no FK cascade into the audit table, and rollback tests for most mutations (see M5).
- **I13/I18 and conventions:**
  - dependency-cruiser passes, and the SDK depends only on `api-contract`.
  - No `Date.now()` in domain code, no `console.*`, no `any`, no default exports.
  - Env is read only in `core/config`, and every runtime dependency is pinned exactly.
  - en and de have the same 210 i18n keys.

## Resolved after review (2026-11-09)

The maintainer asked for H1, M1 and M6 to be fixed on the feature branch. Each fix started from a failing test where a test applies.

- **H1:** `guard.ts` now checks the origin before reading the body, and consumes buckets one at a time (IP/instance minute, IP/instance hour, project, global), stopping at the first denial. Regression test: `abuse-guard.test.ts`, "requests rejected by origin or per-client limits never consume shared project/global buckets". It failed before the fix (a foreign origin received 429 instead of 403) and passes now. ADR-0046 describes the new order.
- **M1:** `KeyRevealDialog` ignores Escape and outside clicks, so only the close button clears the value. Regression test: `key-reveal-dialog.test.tsx`, "Escape and outside clicks cannot discard the one-time value".
- **Verification:** `CI=true bun run check` against the real compose services passes. That covers 260 package tests (both new regression tests included) and 92 script tests, with zero failures and no skips.
- **M6:** the second D33 is now D36. New entries D35 and D37–D43 cover ADRs 0045 and 0047–0053.

## Recommended order

1. Track **H1** as a blocking task for M2 (before forms mount a public write route).
2. Fix **M1** (small UI change) and **M6** (docs only) before merging, if convenient.
3. Add **M3–M5** test coverage early in P2. They protect every route added from here on.
4. Plan **M2** with the P6 deploy work, but add the per-account auth limit sooner.
