# ADR-0019: Every module is optional, enabled with BACKBRICKS_MODULES

- **Status:** accepted
- **Date:** 2026-11-04
- **Related:** ARCHITECTURE §0 #18, §C.1, §C.7, §J.2 #11; AGENTS.md I13, I19; PLAN P0.4, P1.6, P6.1, P6.8

## Context

Many self-hosters need only one feature, for example forms. They shouldn't have to run object storage or a 2 GB ClamAV container for that.

## Decision

**All modules ship in one image; `BACKBRICKS_MODULES` (comma-separated, default all) enables any subset at runtime.** The registry registers only enabled modules. Each module declares its `infrastructure` (`storage`, `scanner`, …), and the env schema and `/readyz` require only what the enabled modules need. Hard dependencies between modules go through `requires`, soft ones through `optional` capabilities. Disabled modules answer `404 module_not_enabled`. All tables are migrated regardless of the selection. Compose profiles (`storage`, `scan`) follow the selection.

## Consequences

- Forms-only runs as app + Postgres; uploads-only runs without ClamAV.
- Enabling a module later is an env change and a restart, no rebuild and no special migration.
- The core and every module must work with any subset; tests boot the app with every single-module subset (P1.6).
- The module → infrastructure declaration lives in the module package from P0 on and moves into `ModuleDefinition` in P1.6, so it exists once.

## Alternatives considered

- **Separate images per module combination:** many artifacts, rebuilds to enable a module. Rejected.
- **All modules always on:** forces storage and scanner on everyone. Rejected.
