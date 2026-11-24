# Backbricks execution plan

M5 merged with green CI. M6 is the next build milestone. Implementation approved on 2026-11-24. The 1.0.0 tag and publication follow the maintainer’s documentation and UI work. [Release status and exit criteria](docs/MILESTONES.md#open-source-track) · [Open decisions](OPEN_QUESTIONS.md)

## Next work

- Review the [M6 implementation and acceptance evidence](docs/progress/phase-6.md). The dashboard-session decision is recorded in [Q28](OPEN_QUESTIONS.md#q28).
- For the release track, the maintainer verifies [Q2](OPEN_QUESTIONS.md#q2). Prepare each preview independently and publish only with explicit release authorization. See [release workflow](CONTRIBUTING.md#releasing-maintainers).

## P6 · Open Source 1.0

**Goal** — A production-ready self-hosted install and CLI coverage for every dashboard administrative workflow. Keep bearer grants project-scoped and the integration agent preset focused on integration.

**Sizing** — The original production track allowance was 6–8 person-days. The working implementation estimate was 113 h including the shared module and platform command dispatcher. This is a planning estimate.

- [x] **P6.0a · Inventory admin workflows (4 h)** (depends on M5) — Map each dashboard action to a generated client operation, route policy, role/scopes, audit and CLI command. Cover platform, auth and all three modules. Flag UI-only flows, bulk actions and operations needing session auth.
- [x] **P6.0b · Plan release and implementation slices (3 h)** (depends on P6.0a) — Split any estimated task over 6 h and size unlisted parity work. Track session-only workflows behind Q28. Recheck new tool/image versions from primary sources before pinning.
- [x] **P6.1a · Production Compose (6 h)** (depends on P6.0b) — Add `deploy/compose/` with Caddy, Postgres, migrate, app and worker. Prove TLS routing, read-only runtime, health checks, persisted volumes and one-shot migration ordering.
- [x] **P6.1b · Select optional services (5 h)** (depends on P6.1a) — Wire storage/Garage initialization, scanner and backup profiles. The configuration command emits consistent `BACKBRICKS_MODULES` and `COMPOSE_PROFILES` without leaking generated secrets.
- [x] **P6.2a · First-admin bootstrap (6 h)** (depends on P6.1a) — Add the setup role and atomic first-run instance setup via system settings. Verify concurrent/replayed setup and invite-only defaults.
- [x] **P6.2b · Owner setup journey (5 h)** (depends on P6.2a) — Guide the first owner through installation and sign-in. Prove the fresh deployment works through the documented dashboard and automation entry points.
- [x] **P6.3a · Proxy upload transport (6 h)** (depends on P6.1b) — Add `UPLOAD_MODE=proxy` for private storage with bounded streaming, server-side validation and cleanup. Reuse completion/copy/scan and preserve public API compatibility.
- [x] **P6.3b · Proxy client and deployment proof (4 h)** (depends on P6.3a) — Exercise the SDK and existing form attachment flow with no public storage endpoint. Test limits, aborted requests, optional scanning and failure cleanup.
- [x] **P6.4a · Back up Postgres and private objects (5 h)** (depends on P6.1b) — Add the backup profile using `pg_dump` and restic. Document credentials, storage coverage, and how to quiesce writers or obtain a consistent recovery point.
- [x] **P6.4b · Prove restore (5 h)** (depends on P6.4a) — Restore into a fresh deployment in CI and read a form entry, a private object and a published review. Document the operator procedure and observed recovery limits.
- [x] **P6.5 · Upgrade from the preview baseline (6 h)** (depends on P6.1a, P6.4b) — Prove migrations and versioned config on an existing database. Document ordering, backup, migration and recovery. Reuse module migration hooks for any background config upgrade.
- [x] **P6.6a · Model and test deployment threats (5 h)** (depends on P6.1–P6.3) — Record threats for auth, browser, proxy, storage and workers. Prove security headers, CSP, login limits and read-only/non-root runtime. Record the base-image decision and verify the reporting path.
- [x] **P6.6b · Review dependency and runtime security (4 h)** (depends on P6.6a) — Review audit findings against shipped surfaces and record actionable fixes. Verify package licenses, runtime versions and production image contents.
- [x] **P6.7a · First-release metadata and checks (5 h)** (depends on P6.5–P6.6) — Verify SPDX/license checks, changelog, GHCR image and reproducible SDK/CLI packaging. Keep legal and registry approvals visible in [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md).
- [ ] **P6.7b · Verify approved publication (deferred)** (depends on product docs/UI, P6.7a, P6.8, P6.9f, Q2, Q29) — Validate signed release tag, GHCR image and clean npm installs with provenance when publication is authorized.
- [x] **P6.8 · Scenario C in CI (6 h)** (depends on P6.1–P6.5) — From an empty runner, follow the README to set up Compose and verify Forms, Uploads and Reviews. Prove Forms-only and unscanned Uploads-only with the minimal service sets.
- [x] **P6.9a · Read submissions and files (6 h)** (depends on P6.0a) — List/show form entries and list/download private attachments through explicitly granted existing routes. Use structured output and stream downloads to a user-selected destination. Test denied grant, foreign project, expiry and download audit.
- [x] **P6.9b · Review queue and moderation (5 h)** (depends on P6.0a) — Cover list/detail and the dashboard's moderation actions using existing route policies. Test per-action permissions, status transitions and audit.
- [x] **P6.9c · Session credential vertical slice (6 h)** (depends on P6.0b, Q28) — Implement the approved interactive sign-in and sign-out/session expiry flow. Prove a session-only operation through existing authorization and audit. Allocate follow-up tasks if the approved protocol needs more work.
- [x] **P6.9d · Remaining module operations (6 h)** (depends on P6.9a–c) — Cover inventory entries for form, upload and review configuration and data, including bulk operations, exports and deletion. Apply explicit destructive confirmation.
- [x] **P6.9e · Remaining platform operations (6 h)** (depends on P6.9c) — Cover project/org administration, members/invites, keys, notification rules, activity, and privacy operations. Match the existing dashboard authorization and audit actor.
- [x] **P6.9f · Verify the parity matrix (5 h)** (depends on P6.9a–e) — Prove each inventory entry through the CLI and check cross-tenant denial, sensitive output, destructive confirmation and audit. Treat submissions and file contents as untrusted data.

### P6 delivery

Use the [M6 exit criteria](docs/MILESTONES.md#m6--open-source-10--v100) as the verification checklist. Record commands and outcomes in `docs/progress/phase-6.md` as they pass. Keep dated release evidence in the milestone record.

## Completed work and history

M0–M5 acceptance evidence is indexed in [milestones](docs/MILESTONES.md#open-source-track). Task IDs, earlier estimates and per-task evidence live in the [P0–P5 plan at the M5 merge](https://github.com/nolliebigspin/backbricks/blob/a9fc3188aeca064fcbb87ea63911d0d713fcf362/PLAN.md). C1–C3 are planned after M6.
