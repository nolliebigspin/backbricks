# ADR-0003: TypeScript 7 and Bun

- **Status:** accepted
- **Date:** 2026-11-04
- **Related:** ARCHITECTURE §0 #2, §H, §J.1 #10; AGENTS.md §4, I18; PLAN "TypeScript 7 decision rule", P0.2, P0.9b

## Context

The maintainer works in TypeScript, React and Tailwind. The project wants one toolchain for runtime, package management, tests and bundling, and fast typechecks across a growing monorepo. Published client packages (SDK, CLI) must still run on Node ≥ 20 (I18).

## Decision

**TypeScript 7 (native compiler) for typechecking and Bun as runtime, package manager, test runner and bundler.** Node is used only for Playwright and for compatibility tests of the published packages.

TypeScript 7's npm package has no classic JavaScript compiler API (it exports only `version.cjs` and `unstable/*`). Tools that need that API get, in this order:

1. a fallback local to the tool (a different parser, or an older `typescript` devDependency in the one package that runs a code generator), or
2. if that doesn't work for a P0/P1 tool, a repo-wide switch to TypeScript 6 (the maintainer accepts TS 6 as a fallback). That switch is recorded in its own ADR and updates this decision.

## Consequences

- Fast typechecks and one `bun` command for most tasks.
- Some tools lag behind TS 7 (dependency-cruiser's TS parsing, `openapi-typescript`, possibly the Better Auth CLI). The P0 spike (ADR-0020) checks each.
- Two TypeScript versions may appear in the lockfile (root TS 7, an older version local to a codegen package).
- Libraries that declare `engines.node` without mentioning Bun need verification before use.
- Published packages are built with `bun build --target=node` and tested on Node.

## Alternatives considered

- **Node.js + TS 5/6 + Vitest/pnpm:** proven, but several tools instead of one and slower typechecks. Rejected; TS 6 stays the fallback compiler.
- **Deno:** smaller ecosystem fit for Drizzle, Better Auth and pg-boss. Rejected.
