# Architecture Decision Records

Short documents that record significant decisions: deviations from or refinements of [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md), and any change to its key decisions (§0) or critical decisions (§J.2).

- File name: `NNNN-short-title.md`, numbered sequentially, starting from [`0000-template.md`](0000-template.md)
- Never rewrite an accepted ADR; supersede it with a new one
- The initial set (one per key decision) is created in the planning run (`/bb-plan`)

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
| 0020 | Library compatibility on Bun and TypeScript 7 (reserved for PLAN P0.9b) | – |
