# ADR-0004: Tooling with mise, Turborepo, oxlint/oxfmt and lefthook

- **Status:** accepted
- **Date:** 2026-11-04
- **Related:** ARCHITECTURE §0 #3, §H; AGENTS.md §4, §8; PLAN P0.1, P0.2

## Context

Contributors (human and agent) need a reproducible setup with one command, fast checks, and the same checks locally and in CI.

## Decision

- **mise** pins tool versions (Bun, Node, lefthook, gh, CodeGraph) and orchestrates the environment (`setup`, `dev`, `infra`).
- **Bun workspaces + Turborepo** run code-level pipelines (`build`, `typecheck`, `test`) with caching and `--affected`.
- **oxlint** in type-aware mode (`oxlint-tsgolint`) and **oxfmt** for linting and formatting.
- **dependency-cruiser** enforces the module and package boundaries (`bun run lint:arch`).
- **lefthook** runs the commit-message check (DCO, Conventional Commits) and the affected checks on `pre-push`.

A command lives either in `package.json`/`turbo.json` (code pipelines) or in `mise.toml` (environment), never both.

## Consequences

- `mise install && mise run setup` is the whole setup.
- oxfmt is 0.x and type-aware oxlint is young; breaking updates are possible (risk J.1 #10).
- dependency-cruiser needs a TS parser that works with TypeScript 7 (ADR-0003).

## Alternatives considered

- **asdf/Volta + Makefile:** two tools for what mise does in one. Rejected.
- **Nx:** heavier than needed for this repo. Rejected.
- **ESLint + Prettier / Biome:** slower (ESLint) or without type-aware rules like `no-floating-promises` (Biome). Rejected.
- **husky:** needs Node scripts; lefthook is one binary with parallel commands. Rejected.
