# Milestones

**Current source** — M5 (Agent-ready) merged in [PR #20](https://github.com/nolliebigspin/backbricks/pull/20) with green CI. **Latest published image** — [v0.1.0](https://github.com/nolliebigspin/backbricks/tree/v0.1.0). **Next** — plan and execute M6 in [PLAN.md](../PLAN.md).

The open-source track ends with a production-ready self-hosted 1.0. Managed cloud work follows. Preview minors may change internal config and database schemas with migration notes. Keep the public `/v1` API additive, config versioned and migrations forward-only. [Release process](../CONTRIBUTING.md#releasing-maintainers)

## Open-source track

### M0 · Foundation

Merged in [PR #4](https://github.com/nolliebigspin/backbricks/pull/4). Workspaces, CI, Compose development, database migrations and image roles. [Evidence](progress/phase-0.md)

### M1 · Platform Core

Merged in [PR #6](https://github.com/nolliebigspin/backbricks/pull/6). Authentication, organizations, project keys, tenant-scoped repositories, config revisions, OpenAPI, audit, workers and the dashboard shell. [Evidence](progress/phase-1.md) · [Review](progress/review-phase-1.md)

### M2 · Forms → `v0.1.0` (developer preview)

Merged in [PR #10](https://github.com/nolliebigspin/backbricks/pull/10) and published via [PR #13](https://github.com/nolliebigspin/backbricks/pull/13). Public JSON and HTML submissions, dashboard inbox, CSV, notifications, expiry and privacy workflows. [Evidence](progress/phase-2.md) · [Image publishing run](https://github.com/nolliebigspin/backbricks/actions/runs/43704367449)

### M3 · Uploads → `v0.2.0`

Merged in [PR #14](https://github.com/nolliebigspin/backbricks/pull/14). Server-finalized direct uploads, copy-then-scan, form attachments, private downloads and durable cleanup. Preview tag and image pending. [Evidence](progress/phase-3.md)

### M4 · Reviews → `v0.3.0`

Merged in [PR #19](https://github.com/nolliebigspin/backbricks/pull/19). Private submissions and moderation, published reads with field allowlisting and ETags, ratings and retention. Preview tag and image pending. [Evidence](progress/phase-4.md)

### M5 · Agent-ready → `v0.4.0`

Merged in [PR #20](https://github.com/nolliebigspin/backbricks/pull/20). Config-as-code CLI, scoped stdio MCP, packaged SDK/admin client, dashboard connection wizard, Starlight docs and examples. Scenario A passed in CI. Local acceptance also proved a real Claude Code MCP write, Node/Bun installation of both tarballs, and an SDK browser root of 4,528 gzip bytes. Preview tag, image and public npm publication pending. [Evidence](progress/phase-5.md)

### M6 · Open Source 1.0 → `v1.0.0`

**Status** — [P6 implementation](progress/phase-6.md) is ready for review. The source candidate has been tested locally. The maintainer will review product documentation and dashboard UI before authorizing the `v1.0.0` tag or publication. [Open release decisions](../OPEN_QUESTIONS.md)

**Exit criteria**

- A fresh VM follows the README to install a production Compose deployment in under 30 minutes. Scenario C runs that setup in CI and exercises all three modules.
- Forms-only runs on the app and Postgres. Uploads-only runs without ClamAV when explicitly unscanned. Proxy uploads work without a public storage endpoint.
- An upgrade from the preview baseline and a backup/restore drill pass. The threat model, headers, dependency/license checks and read-only runtime checks have recorded evidence.
- Each dashboard administrative operation maps to a verified CLI workflow with equivalent role, scope, tenant isolation and audit behavior. Scoped agents can read form entries and download private attachments with explicit grants. Session-only operations preserve user and session authorization.
- The maintainer approves the release. The signed `v1.0.0` tag, GHCR image and npm packages with provenance are verified from a clean install.

### Backlog · Post-1.0 OSS

Webhooks, headless React hooks, resumable uploads, per-project permissions, test/live environments, additional locales and optional CAPTCHA providers. [Candidate modules](MODULES.md)

## Managed cloud track (after M6)

- **C1 · Cloud Foundation** — EU staging, onboarding, metering, entitlements, RLS and verified point-in-time recovery.
- **C2 · Cloud Beta** — Billing, operator runbooks, restore and load drills, legal drafts and closed beta.
- **C3 · Cloud GA** — Verified production customer journey, legal sign-off, status page and launch. Remote MCP is optional.

[Cloud design](CLOUD.md)
