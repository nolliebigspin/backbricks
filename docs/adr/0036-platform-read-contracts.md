# ADR-0036: Platform read contracts

- **Status:** accepted
- **Date:** 2026-11-06
- **Task:** P1.5b; approved Q9 permission matrix

## Context

The dashboard and agents need bounded activity, lossless usage aggregates and safe integration metadata. Organization switching already uses the declared Better Auth organization endpoints, and project switching uses the session-only project list; a parallel organization model/API would duplicate those contracts.

## Decision

The [read routes](../../apps/server/src/routes/platform-reads.ts) declare four operations in the existing manifest. Organization/project activity requires owner/admin sessions, with no bearer access. Project usage permits member sessions or the bound `stats:read` scope. Project integration permits member sessions or `integration:read`. Foreign parent paths remain 404. Every response is `no-store`; no route creates or changes a key/configuration as a side effect.

[Query/response schemas](../../packages/core/src/queries/schemas.ts) and [query services](../../packages/core/src/queries/platform.ts) are the wire source of truth. Activity responses contain opaque actors/targets, structural changes, request ID and timestamp, excluding readable identity labels, organization internals, IP hashes and retention metadata. Expired entries are filtered in SQL before keyset pagination while awaiting the P1.10c hard-purge task. Internal maintenance reads may explicitly inspect retained expired rows.

[Activity fields/filters](../../packages/core/src/platform/activity-fields.ts) share identifiers/names with activity writes. Filters use exact action, actor type/ID and project equality; no regex input. Filters and cursor positions are always ANDed with the trusted tenant scope. An organization collection filtered by another organization's project returns an empty collection; it does not disclose existence. A project path with a conflicting project filter returns 404. Archived project activity remains visible through authorized organization history, while direct archived-project access stays closed. Cursor positions confer no tenant authority.

Usage returns one validated UTC month of aggregate metrics, with bigint values encoded as decimal strings. Positive-year month-start validation rejects malformed historical dates before DB access. This does not expose personal records or create a new counter write API. Registry-owned metric definitions follow in P1.6a; daily gauges remain separate from monthly counters.

Integration explicitly selects project ID/name/slug/allowed origins, an origin-only `/v1` base URL and the newest active publishable token (or null). It excludes all secret metadata, key names, account/member data and arbitrary project settings. The repository queries publishable/active rows directly, so more recent secret/revoked rows cannot hide an older active token behind a list-page boundary. Revocation/expiry takes effect immediately; no GET auto-provisions a credential. Enabled/operational module metadata is added by P1.6b rather than claiming unfinished domain APIs here.

## Evidence and consequences

`bun test apps/server/src/activity-reads.test.ts apps/server/src/integration-reads.test.ts packages/db/src/platform-queries.test.ts apps/server/src/tenant-isolation.test.ts` covers roles/scopes, sibling/foreign parents, filter/cursor tampering, complete pagination, private-field exclusion, archived history, lossless maximum counters, expiry/revocation fallback, null-without-creation and an older publishable key behind 101 newer secret rows. A real DB query test proves the advertised URL never includes configured URL credentials/path/query data. Expiry/year-zero/URL regressions were demonstrated before their fixes.

All four operations have matching cases in the automatic management inventory suite. Mutation snapshots now include monthly usage as well as scoped key state. Switcher data continues to reuse Better Auth/project contracts. UI activity rendering and complete end-to-end owner flows remain P1.12/P1.13; CSV/billing/privacy endpoints are not introduced by this task.
