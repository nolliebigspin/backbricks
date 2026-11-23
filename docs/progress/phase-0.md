# P0 · Foundation

Merged in [PR #4](https://github.com/nolliebigspin/backbricks/pull/4) on 2026-11-06 with green CI. [Full implementation report](https://github.com/nolliebigspin/backbricks/blob/a9fc3188aeca064fcbb87ea63911d0d713fcf362/docs/progress/phase-0.md)

| Area | Evidence at completion |
| --- | --- |
| Workspace | Bun workspaces and CI architecture rules with rule fixtures, package license/runtime checks, commit hook and affected pre-push checks. |
| Development | Compose started Postgres, Garage, Mailpit, migration, server, worker and Vite. Forms-only ran without storage. Dev ports are in [Compose](../../compose.yaml). |
| Runtime | The image ran as a non-root user with a read-only filesystem. Health/readiness and the dashboard responded, and worker/server shutdown exited cleanly. |
| Checks | Local check passed 80 package and 83 script tests. Four Playwright journeys passed. Hosted CI passed build, tests, browser, image and DCO jobs. |
| Tool choices | Bun/TypeScript 7 compat checks, Drizzle 1.0 RC and parser fallbacks. [ADR-0020](../adr/0020-library-compatibility.md) |

The first phase put TypeIDs and Clock in core, used per-role Compose health checks, and used real services when available. Later phases added the route contract, public storage URL and real migrations. See [milestones](../MILESTONES.md) for current status.
