# Phase P4 · Reviews (M4, v0.3.0)

- **Branch** · `feat/p4-reviews`, based on `76d3229`.
- **Date** · 2026-11-22 (Asia/Ho_Chi_Minh).
- **Approval** · Q21–Q23 and ADRs 0076–0077 approved before implementation.
- **Review** · Separate standards and spec reviews of the implementation identified issues with write-scope responses, data-bearing database errors, read consistency, settings revisions, notification availability and snippets. Regressions cover the scope, privacy and consistency fixes. Human DCO review and the formal fresh-session phase review remain pending.

## Delivered

| Area | Implementation |
|---|---|
| Collection configuration | Fixed 2–10 rating scale, manual moderation, validation rules, public field declarations, localized templates, revisions and codegen. [Module](../../packages/modules/reviews/src/module.ts) |
| Submission and storage | Guarded JSON submission, proof of work, idempotent receipt, tenant-bound PostgreSQL rows, usage and a metadata-only event. [Submission](../../packages/modules/reviews/src/public.ts) · [Schema](../../packages/db/src/schema/reviews.ts) |
| Published reads | Stable cursor paging, score distribution, explicit field projection, revision confirmation and conditional revalidation. [Reads](../../packages/modules/reviews/src/read.ts) · [HTTP validators](../../apps/server/src/http/conditional-public-read.ts) |
| Moderation and erasure | Private queue, scoped state transitions, atomic audit, hard deletion, expiry and subject/project erasure. [Management API](../../packages/modules/reviews/src/admin.ts) · [Lifecycle](../../packages/modules/reviews/src/lifecycle.ts) |
| Dashboard and integration | English and German queue, keyboard actions, details, stats, settings and embed. Dependency-free SDK list, stats and submit methods and a static testimonials example. [Dashboard](../../apps/web/src/modules/reviews/pages.tsx) · [SDK](../../packages/sdk/src/reviews.ts) · [Example](../../examples/html/reviews.html) |

## Verification

| Check | Evidence |
|---|---|
| Publishable data | Real HTTP fixtures exercise pending, approved draft, published, revoked, expired and test records. Exact projection and the I5 inventory exclude email, private field canaries, original author names and source. The visibility race fixture makes a field private and publishes the draft while a read is in progress. [HTTP tests](../../apps/server/src/reviews.test.ts) · [I5 checks](../../apps/server/src/public-responses.test.ts) |
| Conditional requests and ratings | Both reads return bodyless `304` for matching validators. List tests cover weak comparison, lists of tags, wildcard, preflight, and changed validators. PostgreSQL-backed rating fixtures exercise distribution, average and cursor traversal after removing an anchor. [HTTP tests](../../apps/server/src/reviews.test.ts) |
| Tenant and data lifecycle | The 15 management routes have session and secret-key isolation cases. The HTTP suite covers storage-error privacy, write-only credentials, audit rollback, expiry, subject erasure and archived-project erasure. [Isolation suite](../../apps/server/src/tenant-isolation.test.ts) · [Lifecycle tests](../../apps/server/src/reviews.lifecycle.test.ts) |
| Migration | An isolated PostgreSQL database applied 17 previous migrations, then the one Reviews migration. Repeating the migration applied zero. Fresh migrations passed in production-image smoke. Regenerating the schema found no drift. |
| Browser and SDK | `bun run test:e2e e2e/reviews.spec.ts --workers=2 --retries=0` passed both Chromium journeys, including German at 390 px. They cover keyboard approval and rejection, publication, unpublication, settings and embed. The example renders review markup as text. The SDK HTTP probe passed on Bun, the configured Node runtime and Node 20.20.2. `CI=true bun run test:sdk-browser` passed the existing native browser transfer acceptance. |
| Build and image | `bun run build` passed. `docker build --platform linux/amd64 -t backbricks/server:p4-final .` and `bun scripts/image/smoke.ts backbricks/server:p4-final` passed Forms-only, Reviews-only, unscanned Uploads-only, and Forms plus scanned Uploads. The Reviews-only image used PostgreSQL without storage or a scanner. Image ID `sha256:7ad1b1b8fe8956d0a2dc5291c5953482960a9c91dae47899c3e128ac9f923c5c`. |
| Repository gate | `CI=true bun run check` passed 603 package tests and 103 script tests, with zero failures. Formatting, lint, architecture, workflow, contract and type checks passed. The final mobile styling and expanded test assertions also passed their focused checks. |
| Additive API | `bun run api:generate`, `bun run api:check`, and `bun run api:breaking --base v0.1.0` passed. |

## Implementation decisions

- The approved conditional-read ADR includes a collection revision check after the public list query. A concurrent revision can return `409`, allowing the caller to retry with one visibility policy. A change that discloses more of an author's name goes through destructive configuration confirmation.
- Moderation responses carry ID and status metadata. Private details require the separate read permission. The admin statistics response derives public and moderation totals from one SQL result.
- The existing 30-day spam expiry and core-derived database enums are reused. Reviews emits the submission event for the outbox. Notification rule options and dispatch use events with a delivery hook.
- The Reviews workspace declares the already-pinned Zod version directly so its runtime validation is available in the production image. The SDK's runtime stays dependency-free.
- Local Compose services stayed up for continued development. The standalone migration and Reviews browser runs dropped their own temporary databases after verification.

## Release and handoff

The [Reviews changeset](../releases/reviews-developer-preview.changeset.md) is staged under `docs/releases/` until the Uploads preview has consumed its pending changeset. Cut the Uploads preview from a revision without Reviews, then activate the Reviews changeset. Changesets applied the two bumps in order in a temporary worktree, yielding `0.2.0` followed by `0.3.0`. The dry run disabled GitHub changelog generation in that worktree because the release token was unavailable. Release configuration in this branch retains GitHub changelog generation.

The maintainer confirmed the local preview worked and authorized the signed-off commit, branch push and pull request on 2026-11-22. The formal phase review and release publication follow separately.
