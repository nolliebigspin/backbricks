# Architecture Decision Records

Short documents that record significant decisions: deviations from or refinements of [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md), and any change to its key decisions (§0) or critical decisions (§J.2).

- File name: `NNNN-short-title.md`, numbered sequentially, starting from [`0000-template.md`](0000-template.md)
- Never rewrite an accepted ADR; supersede it with a new one
- ADR-0002 to ADR-0019 record the key decisions in ARCHITECTURE §0, one per row

## Index

| ADR | Title | Status |
|---|---|---|
| [0001](0001-marketing-site-astro-on-vercel.md) | Marketing site as one Astro app on Vercel | accepted |
| [0002](0002-modular-monolith.md) | Modular monolith with process roles | accepted |
| [0003](0003-typescript-and-bun.md) | TypeScript 7 and Bun | accepted |
| [0004](0004-tooling.md) | Tooling with mise, Turborepo, oxlint/oxfmt and lefthook | accepted |
| [0005](0005-hono-and-zod-openapi.md) | Hono on Bun.serve with @hono/zod-openapi | accepted |
| [0006](0006-dashboard-spa.md) | Dashboard as a Vite SPA served by the API process | accepted |
| [0007](0007-postgresql-and-drizzle.md) | PostgreSQL 18 with Drizzle ORM | accepted |
| [0008](0008-pg-boss.md) | Background jobs with pg-boss | accepted |
| [0009](0009-s3-storage-and-garage.md) | S3-compatible object storage, Garage as the self-host default | accepted |
| [0010](0010-better-auth.md) | Dashboard authentication with Better Auth | accepted |
| [0011](0011-multi-tenancy.md) | Shared-schema multi-tenancy with withTenant, RLS later | accepted |
| [0012](0012-public-abuse-protection.md) | Public abuse protection with self-hosted proof-of-work | accepted |
| [0013](0013-presigned-uploads-copy-then-scan.md) | Presigned PUT uploads with copy-then-scan | accepted |
| [0014](0014-agent-integration.md) | Agent integration via OpenAPI, SDK, config-as-code CLI and stdio MCP | accepted |
| [0015](0015-docker-compose-dev-environment.md) | One Docker Compose file for development and CI | accepted |
| [0016](0016-licensing.md) | AGPL-3.0 for the platform, MIT for clients, DCO for contributions | accepted |
| [0017](0017-self-host-and-cloud-same-code.md) | Same code for self-hosted and cloud | accepted |
| [0018](0018-open-source-first.md) | Open-source release first, managed cloud afterwards | accepted |
| [0019](0019-optional-modules.md) | Every module is optional, enabled with BACKBRICKS_MODULES | accepted |
| [0020](0020-library-compatibility.md) | Library compatibility on Bun and TypeScript 7 | accepted |
| [0021](0021-auth-transactions-and-schema-ownership.md) | Auth transactions and schema ownership | accepted |
| [0022](0022-personal-data-lifecycles.md) | Personal data lifecycles | accepted |
| [0023](0023-platform-schema-integrity.md) | Platform schema integrity | accepted |
| [0024](0024-tenant-repository-boundary.md) | Tenant repository boundary | accepted |
| [0025](0025-abuse-identity-and-rate-limits.md) | Private abuse identity and shared rate limits | accepted |
| [0026](0026-dashboard-auth-runtime.md) | Dashboard auth runtime | accepted |
| [0027](0027-organization-policy-and-invitations.md) | Organization policy and invitations | accepted |
| [0028](0028-management-principals-and-permissions.md) | Management principals and permissions | accepted |
| [0029](0029-automatic-isolation-coverage.md) | Automatic isolation coverage | accepted |
| [0030](0030-project-lifecycle-and-management.md) | Project lifecycle and management | accepted |
| [0031](0031-key-material-and-scope-catalog.md) | Key material and scope catalog | accepted |
| [0032](0032-session-only-key-management.md) | Session-only key management | accepted |
| [0033](0033-credential-safe-diagnostic-boundaries.md) | Credential-safe diagnostic boundaries | accepted |
| [0034](0034-key-authentication-and-exposure.md) | Key authentication and exposure handling | accepted |
| [0035](0035-services-usage-and-entitlements.md) | Services, usage and entitlements | accepted |
| [0036](0036-platform-read-contracts.md) | Platform read contracts | accepted |
| [0037](0037-static-module-contracts.md) | Static module contracts and borrowed capabilities | accepted |
| [0038](0038-module-catalog-and-availability.md) | Module catalog and availability metadata | accepted |
| [0039](0039-module-http-and-worker-wiring.md) | Module HTTP and worker wiring | accepted |
| [0040](0040-generic-instance-lifecycle.md) | Generic instance lifecycle | accepted |
| [0041](0041-revisions-and-config-migrations.md) | Revisions and configuration migrations | accepted |
| [0042](0042-config-documents-and-bound-plans.md) | Configuration documents and bound plans | accepted |
| [0043](0043-atomic-config-apply-and-exports.md) | Atomic configuration apply and exports | accepted |
| [0044](0044-private-s3-storage.md) | Private S3 storage | accepted |
| [0045](0045-proof-of-work-and-replay.md) | Proof-of-work and replay protection | accepted; publishable bootstrap gated by Q11 |
| [0046](0046-public-write-guard-and-cors.md) | Public write guard and CORS | accepted; production publishable bootstrap gated by Q11 |
| [0047](0047-atomic-public-idempotency.md) | Atomic public idempotency | accepted |
| [0048](0048-transactional-postgres-jobs.md) | Transactional PostgreSQL jobs | accepted |
| [0049](0049-outbox-and-restricted-delivery.md) | Outbox dispatch and restricted delivery | accepted |
| [0050](0050-bounded-worker-maintenance.md) | Bounded worker maintenance | accepted |
| [0051](0051-offline-contract-and-admin-client.md) | Offline contract and admin client | accepted |
