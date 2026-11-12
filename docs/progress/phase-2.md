# Phase P2 – Forms (M2 · v0.1.0): report

- **Branch:** `feat/p2-forms`; 29 signed-off commits on top of `main` (9332ac7), including this report; nothing pushed.
- **Date:** 2026-11-12.
- **Status:** All 25 P2 tasks are implemented and every local acceptance command passes against fresh real services. Still open, all for the maintainer: the pull request with green GitHub CI, the GitHub-hosted manual run of the release workflow, `bun run release:version` on `main`, the signed `v0.1.0` tag (which publishes the image) and the phase review by a fresh session (AGENTS §9).

## Delivered

| Area | Result/source |
|---|---|
| Forms module | Strict per-type config schema, four en/de templates, change classifier, codegen ([`packages/modules/forms`](../../packages/modules/forms)); one validator for JSON and plain HTML posts with catalog field codes; module tables in db behind module-owned repository interfaces ([ADR-0055](../adr/0055-module-tables-in-db.md)). |
| Public API | Public schema (allowlisted, cached, rate-limited) and submissions through the shared guard: proof-of-work, honeypot, spam verdicts with a 30-day spam folder, idempotent retries, per-form limits, secret-key server path. Plain HTML posts with success/error redirects or an escaped error page (ADR-0046 addenda, D52/D53). |
| Admin API | List/read with historical labels, search, filters and keyset paging; metadata edits, single/bulk/all deletion with batched erasure; audited, streamed, formula-safe CSV ([ADR-0056](../adr/0056-module-owned-instance-reads.md)–[0058](../adr/0058-audited-paged-csv-exports.md)). Every new route is in the automatic isolation suite and the I5 public gate. |
| Notifications | Member-only rules, outbox dispatch, content-free mails by default, opt-in escaped content, hourly throttling into one digest ([ADR-0059](../adr/0059-notification-rules-and-dispatch.md)/[0060](../adr/0060-notification-delivery-and-throttling.md)). |
| Privacy and retention | Bounded purge rounds (spam always ≤ 30 days), subject export/erasure routes, and the release gate: hard erasure of archived projects with no personal record or job payload left ([ADR-0061](../adr/0061-project-hard-erasure.md)). |
| Dashboard | Inbox with templates, Entries (folders, filters, search, bulk actions, drawer, CSV), Fields editor (destructive changes confirmed via the server's dry run), Settings (proof-of-work, honeypot, retention, redirects, notifications, delete-all, archive) and Embed (key-filled snippets), en/de throughout. |
| SDK and example | Dependency-free `@backbricks/sdk` root entry: `createClient`, `forms.submit` with a WebCrypto ALTCHA solver and `BackbricksError` with `fieldErrors` ([`packages/sdk`](../../packages/sdk)). [`examples/html`](../../examples/html) contains exactly the dashboard's snippets ([ADR-0062](../adr/0062-minimal-sdk-snippets-and-release-version.md)). |
| Release | Changesets (product version = `@backbricks/server`), [`release.yml`](../../.github/workflows/release.yml) (tag → version check, CI-identical build, smoke, push to `ghcr.io/nolliebigspin/backbricks`), actionlint in `check`/CI, README quickstart, CONTRIBUTING "Releasing". |

## Acceptance evidence

All commands passed on 2026-11-12 on macOS arm64 against the compose services (Postgres 18, Garage, Mailpit) at commit `c880eb6`. E2E ran on a newly created, empty database. No skipped integration result is counted as proof.

| Criterion | Command / evidence | Result |
|---|---|---|
| HTML and fetch examples create visible entries | `bun run build && CI=true TEST_DATABASE_URL=<fresh db> bun run test:e2e --retries 0` | 13 passed, no retries. [`forms-examples.spec.ts`](../../e2e/forms-examples.spec.ts): the no-JS example lands on `thanks.html` and the entry shows in the German dashboard; the SDK example solves a real proof in Chromium and the entry shows in the English dashboard. `forms-html.spec.ts` and all M1 journeys also pass. |
| Structured validation errors | Server: `forms.public.test.ts` (JSON `validation_failed` with `errors[]` paths/codes, no values), `forms.html.test.ts` (HTML failure pages with codes/paths only), `sdk.test.ts` (`fieldErrors`). E2E: `email: invalid_email` on the no-JS error page; the SDK example renders `email: …` from `fieldErrors`. | Passed. |
| Spam/honeypot; content-free notification | Server: `forms.public.test.ts` (honeypot pretends success and stores nothing; link-heavy entries go to the spam folder with a 30-day expiry), `notification-delivery.test.ts` (Mailpit content-free by default). E2E: honeypot post → 303 with no entry; the owner's Mailpit notification names the form but contains neither the message nor the email address. | Passed. |
| CSV injection-safe; expired entries purged | `CI=true bunx turbo run test --force`: `packages/core/src/export/csv.test.ts` (formula defusing + fast-check), `forms.export.test.ts` (`=SUM(1)` exported defused, 50,000-row bounded memory), `forms.retention.test.ts` (clock-driven purge). E2E: the dashboard's CSV download contains `'=SUM(1)`. | 450 package tests passed (sdk 8, core 93, adapters 7, forms 107, ui 15, web 27, db 58, server 135), 0 cached, 0 failures, 0 skips. |
| Isolation covers new routes | Same run: `tenant-isolation.test.ts` (every registered management and generated instance operation has a concrete cookie and key case), `public-responses.test.ts` (every public operation has an I5 case); `bun run test:scripts` | Passed; 99 script tests including the architecture fixtures (new: `example-imports-core`). |
| Release gate | `project-erasure.test.ts` in the same run | Passed: no row in any `project_id` table but the audit log, no job payload, rollback and resume, tombstone. |
| Contract and quality | `bun run api:generate && bun run api:check && bun run api:breaking --base main`; `git diff --exit-code -- packages/api-contract`; `CI=true bun run check`; `bun run build` | Passed: compatible (additive only) against `main` 9332ac7; no contract drift; check and build green. |
| Image smoke, forms only | `docker build -t backbricks/server:v0.1.0-rc . && bun scripts/image/smoke.ts backbricks/server:v0.1.0-rc` (`BACKBRICKS_MODULES=forms`, app + Postgres) | Passed: migrate, private non-root serve/dashboard, worker job consumption, graceful shutdown. Local arm64 image ≈ 386 MB. No registry push. |
| SDK runtime floor | `mise exec node@20.20.2 -- bun test src/sdk.test.ts` and `mise exec node@24 -- …` (apps/server); `mise exec node@20.20.2 -- bun run --cwd packages/sdk test` | Passed: real-server submissions with solved proofs from Bun and a Node child process on Node 20.20.2 and 24.22.1. |
| README quickstart | Fresh `git clone` (plus the then-uncommitted P2.10a diff) → `mise run setup` → `mise run dev` under its own Compose project on shifted ports; scripted walk over the dashboard origin | Passed: sign-up, Mailpit verification, organization, project, form from `contact-en`, publishable key, SDK submission with a real proof → `{"total":1}`. The clone's containers and volumes were removed afterwards. |
| Release | `bunx changeset status` → `@backbricks/server -> 0.1.0`; `changeset version` dry run in a throwaway clone; `bun run lint:workflows` | Changelog generation and the post-bump frozen install work; workflows lint clean. **Open (maintainer):** `release:version` on `main` with `GITHUB_TOKEN`, the signed tag, the GHCR image built by the tag, the manual `workflow_dispatch` run and green CI on the PR. |

## Findings resolved during acceptance

- **SDK and CORS (P2.9b, fixed in `1f7977d`).** The SDK sent publishable keys as a bearer header. Browsers send no `Authorization` header on preflights, and the server's preflight needs `?key=`, so a real browser could not submit. The Node and Bun tests had missed it because they send no `Origin` header. The browser journey failed first; the SDK now sends publishable keys as `?key=`, and its tests assert that.
- **M1 E2E expectation.** `projects.spec.ts` still asserted that there is no Inbox link. P2.8a adds it whenever forms is enabled (the E2E server enables forms), so the assertion now expects it. None of the P2.8 screens had been run in a real browser before P2.9b; they now are.
- **New workspace plumbing.** `examples/html` needed its own dev compose `node_modules` volume (the compose test caught it), `engines.node >= 20` like every MIT package, and the Dockerfile's manifest copy had to include `examples/` so the frozen install keeps matching the lockfile.
- **I18 for examples.** Nothing enforced that examples stay off AGPL code. The `examples-only-mit` rule now does, and `lint:arch` cruises `examples/`.
- **Exact snippets.** The formatter rewrote the example HTML, which would break the comparison with the dashboard, so `examples/html/*.html` is excluded from it. The generated `sdk.js` is formatter-clean. The SDK script's submit handler no longer passes a promise to `addEventListener` (lint).

## Deviations

All are recorded in `PLAN.md` execution notes, ADRs 0055–0062 and `OPEN_QUESTIONS.md` D51–D60, which await confirmation. The ones that change what M2 looks like from outside:

- The Embed tab's third snippet is a **server-side** fetch with a secret key, not a browser fetch, because a browser can't pass proof-of-work without the SDK (D60).
- With a publishable key, the SDK always solves a proof, even for forms with proof-of-work off (D60).
- Notification mails are English until members have a language preference (D58).
- Project hard erasure has no storage-backed module to exercise yet; uploads (M3) must prove the object path through `eraseScope` (D59).
- Forms can't add `file` fields until uploads provides the `files` capability (M3).

## Known gaps

- **Notification latency:** the outbox is dispatched by a once-a-minute schedule (P1.10b), so a notification can take up to about two minutes. The E2E waits 150 s.
- **SDK on Node:** WebCrypto's per-call overhead makes a proof take a few seconds on Node (fast in browsers and Bun). Servers should use a secret key; the web-worker solver and size budget are P5.1.
- **Entries list accessibility:** the first value of each row is a button whose label ("Open the entry from {time}") replaces its visible text, so screen readers don't hear the name. This is a label-in-name mismatch, worth fixing in the review/P6 hardening.
- **E2E repeatability on a shared database:** the fixture's synthetic per-test IPs are deterministic, so repeated local runs against the same database can trip the sign-up rate limit. CI and the acceptance run use a fresh database.
- **Copy buttons:** the Embed tab has none yet.
- **Platform evidence:** the image and browser evidence is local arm64 only; the amd64 GitHub runners are the PR's CI.

## New risks

- **Snippets are product text.** Any change to `snippets.ts` changes `examples/html` and what owners paste into live sites. The comparison test keeps them in sync, but not backwards compatible: published snippets should change additively.
- **One version for everything.** The release workflow trusts `apps/server/package.json`. A release made without `release:version` is refused by the tag check, which is intended but easy to trip over.

## Resume

1. Open the PR for `feat/p2-forms` → `main` and get CI green (quality, tests, E2E, image, DCO).
2. Have a fresh session review the phase (AGENTS §9), and confirm or redirect D51–D60.
3. After merging: `GITHUB_TOKEN=… bun run release:version` on `main`, commit the changelog through a PR, then `git tag -s v0.1.0 -m v0.1.0 && git push origin v0.1.0`. Optionally first run the Release workflow manually with "Push the image" off.
