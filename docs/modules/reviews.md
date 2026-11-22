# Reviews module plan

**Status** · Approved 2026-11-22 (P4.0a, Q21–Q23)

**Milestone** · M4, targeted for v0.3.0 after the Uploads preview

Reviews lets a site collect ratings and written feedback in named collections. A dashboard member moderates each submission and explicitly chooses which approved reviews to publish. The project can then display published reviews and rating statistics in its own UI.

## Collection configuration

- Use the generic `review-collections` instance routes, revisions, configuration plans and TypeScript code generation. Ship an English and German testimonials template. Reviews requires PostgreSQL only and declares no cross-module dependency.
- Configure an integer rating maximum from 2 through 10, default 5. Choose it when creating a collection and keep it fixed for that collection. Each published rating, ordering and histogram then uses the same scale throughout the collection's lifetime.
- Require a rating and author name. Title, body and email each have a required switch. Apply configurable title/body limits inside the route's fixed 16 KiB request cap. Normalize subject email with the shared privacy schema. Reserve names that overlap built-in or abuse-envelope fields.
- Allow a bounded set of named, short plain-text extra fields. Each declaration sets requiredness and visibility, with private as the default. Validate every value against the active declaration and reject unknown fields. Store public and private extra fields separately. The public projection intersects the stored public values with the current public allowlist, so a field made private disappears immediately and values collected privately stay private.
- Support manual moderation, bounded retention with the existing 180-day default, the shared proof-of-work policy, author display as first name and last initial or initials, and optional plain-text verification-method wording. The wording describes the operator's process. The module does not assert a review was verified.
- Return useful warnings when tighter validation affects integrations. Treat public exposure changes and field removal conservatively in config plans. Reuse the current retention hooks for recomputing deadlines. Shorten spam retention using the applicable shared policy and exclude expired rows immediately from live reads.

## Persistence and lifecycle

Use the [ADR-0055 repository seam](../adr/0055-module-tables-in-db.md). Reviews declares its repository interface. `packages/db` implements it with `withTenant`, a central generated migration, the existing tenant scope helper and composite foreign keys binding each row to the organization, project and collection. Restrict parent deletion until explicit child erasure, as in [ADR-0069](../adr/0069-erasure-requires-enabled-modules.md). Store `rev_` IDs, submission config revision, rating, text, author and normalized subject email, extra fields, moderation state and timestamps, publication time, `isTest`, minimized source, spam verdict and expiry. Enforce the rating range and publication constraints in PostgreSQL. Index the moderation queue, public sort keys, subject lookup and retention batches. Use the injected clock for domain timestamps and expiry checks.

Every submission starts pending and unpublished. Approve and reject set the moderation decision. Publish requires approval. Unpublish preserves approval, and reject clears publication atomically. Repeating an action against its resulting state is a no-op. Concurrent actions lock in the platform's project-first order. Test records can be reviewed privately and cannot be published. Hard deletion and effective state changes write content-free audit entries in the same transaction. Submission writes use atomic idempotency and update the `reviews.submissions` usage counter and a metadata-only `reviews.submission_created` outbox event. M4 adds no review-specific notification delivery.

Reuse platform maintenance for bounded expiry and subject/project erasure. Subject export includes private records only through the existing authorized privacy endpoint and its completeness limit. Subject deletion removes whole matching records, including published ones. Project erasure drains review rows in batches and respects the platform rules for disabled modules. Verify composition and jobs with Reviews alone and with other module selections.

## Public and management API

All paths are under `/v1`. Collection keys resolve inside the credential's project. Management routes declare permissions and enter the isolation suite, including routes mounted by the generic collection contract.

| Method and path | Contract |
|---|---|
| `POST /public/review-collections/{key}/reviews` | JSON via AbuseGuard, with publishable-key proof of work or a server secret with `reviews:submit`. Accepts idempotency keys. Return only the caller's new review ID or the existing honeypot acknowledgement. |
| `GET /public/review-collections/{key}/reviews` | `newest`, `rating_desc` or `rating_asc`; up to 50 per page. Return only ID, rating, title, body, formatted display name, explicitly public extras and publication time. |
| `GET /public/review-collections/{key}/stats` | Rating scale, count, average rounded to two decimals (null when empty) and a distribution with a bucket for every value on the scale. |
| `GET /projects/{projectId}/reviews` and `GET /projects/{projectId}/reviews/{id}` | Paginated queue filtered by collection and moderation/publication state, and private record detail. Session member or `data:read`. |
| `PATCH /projects/{projectId}/reviews/{id}` | `approve`, `reject`, `publish` or `unpublish`. Session member or `data:write`. Uses a strict action schema. |
| `DELETE /projects/{projectId}/reviews/{id}` | Hard-delete one record. Session member or explicitly granted `data:delete`. |
| `GET /projects/{projectId}/review-collections/{key}/stats` | Public rating figures plus moderation counts. Session member or `stats:read`. |

The management queue accepts `pending`, `approved` (approved drafts), `published`, `rejected` and `to_review` (pending and approved drafts). List and stats use the same eligibility predicate for approved, published, non-test and unexpired rows in the collection. Build the response with explicit schemas and field selection. Never serialize the original author name column, email, private extra fields, source, spam markers or internal moderation state on these routes. Plain-text review content stays plain text wherever the project renders it.

Order newest by publication time and ID descending. Rating sorts use rating in the requested direction, then the same publication time and ID tiebreakers. Use keyset cursors bound to the collection and requested sort, carrying the ordering tuple so deleting the previous page's last row does not break a traversal. Apply validated row predicates inside the tenant scope. This extends the shared cursor codec as described in [ADR-0076](../adr/0076-typed-page-cursors.md).

Both public GETs declare conditional responses. The HTTP host authorizes and resolves the current representation before applying `If-None-Match`. Compute a weak ETag from the projected representation. A `304` includes the validator, cache policy and normal CORS/`Vary` headers, with no body. Require revalidation on every reuse with `Cache-Control: public, no-cache` and retain `Vary: Origin, Authorization` so that access revocation, unpublication and expiry take effect on the next request. See [ADR-0077](../adr/0077-conditional-public-review-reads.md).

## Dashboard and integrations

- Register Reviews navigation only when the module is operational. Reuse the running-bond dashboard shell, collection selection, role checks, shared UI components and query patterns. Provide To review, Published, Rejected, Stats and Embed tabs. Make approved drafts and unpublished reviews reachable in To review.
- Provide card-based, keyboard-accessible moderation with scoped A/R shortcuts, focus handling and safeguards when the user types into controls. Show read-only review detail and confirm hard deletion. Render hostile input as text. Localize the collection settings, stats, embed examples and a note asking operators to verify their transparency obligations with legal counsel.
- Extend the existing MIT SDK client with `reviews.list`, `reviews.stats` and `reviews.submit`, with public types from the generated API contract. Reuse transport, error mapping, proof solving and idempotency behavior. Extend the HTML/JavaScript example with submission, published list and statistics. Use existing snippet generation and DOM text rendering.
- Add local preview metadata and update the quickstart. Keep the v0.2.0 and v0.3.0 versioning steps distinct because pending minor changesets for the same package coalesce when applied together.

## Acceptance

- Real PostgreSQL tests cover public eligibility, sorting ties in both rating directions, deletion of a cursor anchor, malformed/foreign cursors and histogram fixtures. HTTP snapshots cover every public success shape and its preflight, with private values seeded as canaries.
- HTTP tests replay validators through publication, unpublication, expiry, visibility changes and credential/origin changes. Cover a bodyless `304`, nonmatching validators, weak comparison, list syntax and `*`.
- Real HTTP and PostgreSQL tests cover role/scope and cross-tenant isolation, validation and proof, idempotency and rollback, audited state transitions, privacy export/erase and bounded maintenance. Run the generated route and public-response inventories and regenerate the additive OpenAPI contract.
- Playwright exercises collection creation, visitor submission, dashboard moderation and public site refresh through publication and unpublication, plus English/German and mobile controls. Verify SDK transport in Bun and Node and test a Reviews-only boot without storage or a scanner, alongside the existing module combinations.
- Record exact check commands, observed exit-criterion evidence, implementation decisions and release state in `docs/progress/phase-4.md`.

Automated moderation, identity verification, replies, review imports, review notifications, public widgets, and the general CLI/MCP work in M5 are outside this milestone's scope.
