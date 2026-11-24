# P6 · Open-source 1.0 implementation

The maintainer approved M6 implementation on 2026-11-24. The 1.0.0 tag and publication follow a separate product documentation and dashboard UI pass. See the [milestone](../MILESTONES.md#m6--open-source-10--v100) and [release decisions](../../OPEN_QUESTIONS.md).

## Delivered

| Area | Implementation |
| --- | --- |
| Production deployment | Caddy TLS, start ordering, read-only non-root app and worker, optional Garage and ClamAV, and first-owner setup. The setup role is operator-only and single-use. [Compose and runbook](../../deploy/compose/README.md) |
| Private storage | Bounded upload proxy tickets, provider-bound targets, server-finalized sessions, immutable copy and scan, and audited attachment downloads. [ADR-0082](../adr/0082-production-bootstrap-and-storage-proxy.md) |
| Recovery and upgrades | Quiesced Postgres and Garage snapshots, encrypted restic retention, preflight verification, fresh-target restore, and an upgrade from the published Forms preview. [Recovery runbook](../../deploy/compose/README.md#backup-and-restore) |
| CLI administration | 87 generated commands cover management and organization operations. Existing scopes and roles remain authoritative. Interactive CLI login uses the signed dashboard session with explicit deployment and organization selection. [CLI admin guide](../../packages/cli/ADMIN.md) · [ADR-0081](../adr/0081-cli-dashboard-authorization.md) |
| Security and release preparation | Dashboard CSP, HSTS, dependency audit, client license-closure check and staged release notes. [Threat model](../SECURITY-MODEL.md) · [Staged changeset](../releases/open-source-1.0.changeset.md) |

## CLI workflow inventory

Use `backbricks admin list --json` as the generated list of operation IDs, role/scope requirements and paths. Every listed operation has a CLI dispatch check. The server isolation suite exercises the real authorization policies. Response bodies and operation-specific validation follow the committed [API contract](../../packages/api-contract/openapi.json).

| Dashboard workflow | CLI mapping | Audit and authorization evidence |
| --- | --- | --- |
| Form entries, attachments and exports | `forms.submissions.*`, `uploads.files.*` | Scoped entry reads, sibling-project denial, private file bytes and audited download in Scenario C. CSV and subject ZIP stream to private files under the existing session policies. |
| Review queue and publication | `reviews.records.*`, `reviews.collection.stats` | Scenario C reads the queue and unpublishes and republishes through the CLI. The underlying mutations write the same review audit events as the dashboard. |
| Module and project configuration | `*.instance.*`, project operations, config plan/apply | Version requirements and plan hashes stay on the existing routes. CLI tests require explicit destructive opt-in. Dry runs are read-only. |
| Members, invitations and organization | `organization.*`, `membership.*`, `invitation.*` | The CLI uses the guarded Better Auth routes. Tests cover organization parameter placement, session policy and logout. |
| Keys, notifications, privacy and activity | `createKey`, `revokeKey`, `notifications.*`, `privacy.*`, activity routes | Scenario C shows one-time session-authorized key issuance and the audited download. Retention, export and erasure policies stay on the existing handlers. |
| Account and browser presentation | `session login`, `session logout` | Account enrollment and password-reset links stay in the account workflow. Visual interactions such as drawer state, clipboard UI and inline preview do not have management counterparts. |

## Verification

- `CI=true bun run check` passed against real Postgres, Garage, ClamAV and Mailpit, including OpenAPI drift and compatibility.
- `bun scripts/deploy/scenario-c.ts <candidate-image> --baseline=ghcr.io/nolliebigspin/backbricks:0.1.0` exercised production TLS and headers, concurrent setup, a 2 MiB scanned proxy upload, a claimed form attachment, publication, scoped and dashboard-session CLI access, encrypted backup and restore, and both minimal deployments. It created a form through the published 0.1.0 image and verified its original entry and revision after upgrade. The CI image job runs the same suite.
- A standard Linux amd64 Docker build passed. The final local Scenario C run used the built dependency and dashboard layers with the final server sources layered on top. GitHub CI builds directly from the Dockerfile.
- The browser suite passed 23 Chromium journeys, including dashboard authentication, both languages, file transfer and the packaged Scenario A integration.
- The client packages are available as local `1.0.0-rc.0` tarballs. Provenance and registry verification remain part of publication.
- The internal standards and specification reviews identified gaps in backup coverage and rotation, proxy addressing and response headers, CLI destructive confirmation, and organization selection. Those findings are addressed in the implementation and tests.

## Release handoff

The source is prepared for the docs and UI review. Before tagging or publishing, complete Q2 and Q29, finish the legacy source SPDX annotation pass, reactivate the staged Changeset after the outstanding previews, and confirm GitHub CI and a clean release install. Release work is tracked as P6.7b.
