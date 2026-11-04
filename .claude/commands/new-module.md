---
description: Plan (and after approval implement) a new website module, e.g. /new-module waitlist "…purpose…"
argument-hint: <name> "<purpose>"
---

Read `AGENTS.md`, `docs/ARCHITECTURE.md` section C (especially C.5) and the existing modules in `packages/modules/`.

Plan the module described here: **$ARGUMENTS**

Rules: no changes to `packages/core` or existing modules unless justified upfront in an ADR and approved. Deliverables: config schema, tables + migration, public and admin routes, jobs, `retention` and `privacy` handlers, usage metrics, dashboard pages, SDK method, tests incl. the isolation suite, docs. Reuse core helpers (pagination, CSV, audit, events, retention); don't re-implement them.

Write the plan to `docs/modules/<name>.md`, then stop and wait for approval before implementing.
