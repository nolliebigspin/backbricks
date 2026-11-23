# Backbricks contributor instructions

Backbricks provides headless Forms, private Uploads, and Reviews through API, SDK, CLI and MCP. Site owners use the dashboard.

## 1. Start here

- Read [PLAN.md](PLAN.md) for current work and dependencies. Read [milestones](docs/MILESTONES.md) for release status and [open questions](OPEN_QUESTIONS.md) for decisions that gate work. For an issue, use its acceptance criteria.
- Check the branch, status and diff before editing. Resume unfinished work in the existing checkout and preserve user changes.
- Trace callers, reuse existing helpers, and check the relevant [architecture](docs/ARCHITECTURE.md) section and [ADRs](docs/adr/) before changing a contract. Keep code, generated contracts and tests as the source of truth.

## 2. Boundaries

### 2.1 Dependencies

- `apps/server` composes HTTP, workers, core, modules, DB, auth and adapters. Keep domain behavior in its owning package.
- `packages/core` owns contracts and pure shared behavior. Adapters implement its external interfaces. Modules import core and their own files. Cross-module calls go through declared capabilities.
- `apps/web` uses the generated `@backbricks/sdk/admin` client and `packages/ui`. `apps/www` imports only `packages/ui` from the monorepo at runtime. SDK and CLI use generated API types and never import server code. Dependency rules run in CI.

### 2.2 Source of truth

Derive types from Zod or OpenAPI. Use core config for application environment, the error catalog and `AppError` for expected failures, and existing pagination, audit and retention helpers. Put development services/ports in `compose.yaml`, tool pins in `mise.toml`, and dependency pins in package manifests. Regenerate contracts and schema migrations with the existing commands.

### 2.3 Reuse

Consolidate the same concept in its owning module or core. Keep superficially similar rules separate when their meanings differ. Change shared contracts and callers together.

### 2.4 Package entry points

Import other packages by name through declared exports. Export public functions through the package entry point and document them with TSDoc. Keep module-owned helpers local until there is a real shared use.

## 3. Invariants

| ID | Required behavior |
| --- | --- |
| I1 | Tenant rows carry organization and, where applicable, project IDs. Use `withTenant` repositories. Only the exact active-key SHA-256 auth bootstrap may return key/org/project IDs before scoping (ADR-0034/0054). |
| I2 | Foreign-tenant resources return `404`. |
| I3 | Every management route declares role/scope requirements and has tenant-isolation coverage. |
| I4 | Store secret keys only as SHA-256 hashes. Show them once and keep them excluded from logs, errors, events and audit. |
| I5 | Public responses expose only declared public fields or the caller's own submission/upload identifiers. Test the projection. |
| I6 | Reject a secret key with a foreign Origin as `403 secret_key_exposed`, audit it, and notify. |
| I7 | Key creation requires a dashboard session. Keys and MCP require explicit grants for personal-data access or deletion. |
| I8 | Treat user content as untrusted. Avoid `dangerouslySetInnerHTML`, render reviews as text, escape email and defuse CSV injection. |
| I9 | Files are private. Use short-lived presigned GETs with attachment disposition and allow inline preview only for detected PNG/JPEG/WebP/GIF. Use opaque object keys and scan a copy that no upload URL ever targeted. |
| I10 | Validate HTTP inputs with Zod, enforce body limits, and disallow user-provided regex. |
| I11 | Rotate IP HMACs, bound expiry for personal, audit and transient records, and hard-delete personal data. Active identities, memberships and recipients follow their explicit lifecycle (ADR-0022). Email notifications omit submission content by default. |
| I12 | Audit administrative mutations in the same transaction, without submission content. |
| I13 | Modules depend on core and their own files. Use capabilities for cross-module operations. |
| I14 | External services use swappable ports. The core has no proprietary service dependency. |
| I15 | Self-host/cloud differences use dependency injection. Modules have no cloud-specific branches. |
| I16 | Website integration is headless. Sites own their UI and CSS. |
| I17 | Keep public `/v1` additive. Commit regenerated OpenAPI and pass drift and compatibility checks. |
| I18 | MIT clients, examples and skills import no AGPL implementation and work on Node 20+ and Bun. |
| I19 | Modules are optional. Declare capabilities/provider needs and test supported subsets. |

## 4. Run and verify

| Task | Command |
| --- | --- |
| Install tools, dependencies and hooks | `mise install && mise run setup` |
| Full development environment | `mise run dev` |
| Real test services | `mise run infra`, then `mise run scan` for scanned uploads |
| Focused checks | `bun test <file>`, `bunx turbo run test --affected` |
| Local CI gate | `CI=true bun run check` |
| Browser journeys | `bun run test:e2e <spec>` after [browser setup](CONTRIBUTING.md#verification) |
| Database / API artifacts | `bun run db:generate`, `bun run db:migrate`, `bun run api:generate`, `bun run api:check` |

## 5. Conventions

Validate file, job and configuration inputs at their boundary. Use strict ESM TypeScript with `noUncheckedIndexedAccess`, named exports, kebab-case filenames, generated TypeIDs and the injected clock. Avoid `any`. Use structured logging through `ctx.log` without credentials or personal data. Keep UI copy in the English and German locale files and reuse components in `packages/ui`. Start a new module with the [module checklist](docs/MODULES.md#rules-for-new-modules).

## 6. Code navigation

If `.codegraph/` exists, use MCP `codegraph_explore` or `mise run codegraph -- explore "<symbols or question>"` before searching or reading code. Otherwise use `rg` and read the relevant source. [Opt-in setup](CONTRIBUTING.md#optional-code-navigation)

## 7. Tests

Test behavior at public entry points. Use real Compose services and isolated fixtures for integration tests. Reproduce a bug with a failing test before fixing it. Cover new management routes in the tenant-isolation suite and new public payloads in the public-response suite. `CI=true` makes required services fail closed instead of skipping.

## 8. Git

Use a feature or docs branch from protected `main`. Use Conventional Commits with a task/issue reference and DCO sign-off after human review. Keep hooks active and require green CI for PRs. Push or open PRs when asked. Preserve published history. See [CONTRIBUTING.md](CONTRIBUTING.md).

## 9. Milestones

Plan 2–6 h tasks with dependencies and observable acceptance criteria. Record unresolved choices in [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md), architectural choices in ADRs, and confirm changes to invariants or key decisions before implementation. Execute approved tasks in plan order. Verify and record one task at a time, use focused signed-off commits after human review, and record milestone acceptance in `docs/progress/`. Resume at the next unblocked task. Formal phase review runs in a separate session and changes no code.

## 10. Scope

Keep changes tied to the requested work. Verify new dependency APIs and versions, pin runtime dependencies exactly, and explain additions in the commit body. Keep credentials, local state and generated build output out of Git. Do not edit generated contracts or applied migrations by hand.
