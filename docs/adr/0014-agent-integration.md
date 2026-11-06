# ADR-0014: Agent integration via OpenAPI, SDK, config-as-code CLI and stdio MCP

- **Status:** accepted
- **Date:** 2026-11-04
- **Related:** ARCHITECTURE §0 #13, §D.7–§D.10; AGENTS.md I7, I17, I18; PLAN P5

## Context

AI coding agents (Claude Code, Codex, Cursor) should integrate Backbricks without human help, safely: no key creation, no data deletion and no reading of personal data without explicitly granted scopes.

## Decision

- **REST API with a committed OpenAPI contract** (additive-only within `/v1`).
- **`@backbricks/sdk`** (MIT, dependency-free) for websites and servers.
- **CLI `backbricks`** (MIT) with **config-as-code** in `backbricks.config.json` and a two-step plan/apply (`planHash`).
- **MCP server over stdio inside the CLI**, authenticated with a scoped secret key. A remote MCP server with OAuth 2.1 comes later (C3.2).

## Consequences

- Agents work with files and commands they already understand; changes are reviewable diffs and can be rolled back via revisions.
- Secret keys with scopes and presets limit what an agent can do; key management stays in the dashboard (I7).
- The SDK and CLI must stay free of AGPL code and run on Node ≥ 20 and Bun (I18).
- `backbricks doctor` catches secret keys in public env variables.

## Alternatives considered

- **MCP only:** not every agent or CI uses MCP; files and CLI work everywhere. Rejected as the only path.
- **Remote MCP first:** needs OAuth and hosting; stdio works immediately. Deferred.
