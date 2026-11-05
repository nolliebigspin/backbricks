# ADR-0005: Hono on Bun.serve with @hono/zod-openapi

- **Status:** accepted
- **Date:** 2026-11-04
- **Related:** ARCHITECTURE §0 #4, §D.3, §D.4, §H; AGENTS.md I10, I17; PLAN P0.5a, P1.11

## Context

The API is the product: websites, the SDK, the CLI, the MCP server and the dashboard all use it. Validation, the OpenAPI contract and TypeScript types must not drift apart, and the public API needs precise control over CORS, body limits, rate limits and streaming.

## Decision

**Hono running on `Bun.serve`, with routes defined through `@hono/zod-openapi`.** One Zod schema per route gives server-side validation, the OpenAPI document (`/v1/openapi.json`, committed to `packages/api-contract`) and the types.

## Consequences

- Validation, documentation and types come from one source (AGENTS.md golden rule 3).
- Routes are testable without a network via `app.request()`.
- Web-standard `Request`/`Response`, so the app isn't tied to Bun.
- Every route must be defined through the OpenAPI router to appear in the contract; a drift check in CI (P1.11) enforces the committed spec.

## Alternatives considered

- **Fastify:** mature, but Node-centric and a separate schema system. Rejected.
- **Elysia:** Bun-native, but ties the code to Bun and a smaller ecosystem. Rejected.
- **Next.js route handlers:** see ADR-0002. Rejected.
