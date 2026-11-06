# ADR-0015: One Docker Compose file for development and CI

- **Status:** accepted
- **Date:** 2026-11-04
- **Related:** ARCHITECTURE §0 #14; AGENTS.md §2.2; PLAN P0.3a, P0.3b, P0.8b

## Context

The platform depends on Postgres, S3 storage, an SMTP catcher and optionally ClamAV. Setting these up by hand differs per machine, and CI service definitions tend to drift from local ones.

## Decision

**`compose.yaml` at the repository root defines the whole dev environment: infrastructure (Postgres, Garage + init, Mailpit, ClamAV behind profile `scan`, storage behind profile `storage`) and the app services (`server`, `worker`, `web`) from one dev image.** CI starts its services from the same file. `mise run dev` and `mise run infra` wrap it.

## Consequences

- One definition of the environment, no drift between local and CI.
- App services bind-mount the source and keep `node_modules` in named volumes, one per workspace, because Bun's isolated linker writes per-package `node_modules` and host binaries (macOS) must not leak into Linux containers.
- File watching across bind mounts on macOS may need polling.
- The production compose (`deploy/compose/`, P6.1) is a separate file with different concerns (TLS, backups).

## Alternatives considered

- **Infra in Docker, apps on the host only:** still supported via `mise run infra`, but not the default because host setups differ.
- **Dev containers / Nix:** more setup and less familiar to contributors. Rejected.
