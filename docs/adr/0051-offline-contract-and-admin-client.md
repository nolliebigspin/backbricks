# ADR-0051: Offline contract and typed admin client

- Status: Accepted
- Date: 2026-11-06
- Task: P1.11b; Q5/DEV-8 and ADR-0020

## Decision

The [platform registration function](../../apps/server/src/routes/platform.ts) is shared by production runtime, real HTTP fixtures and the [offline exporter](../../apps/server/src/openapi.ts). The exporter constructs real lazy providers/repositories with explicit unreachable/offline configuration, registers the real handlers and reads the shared [OpenAPI document definition](../../apps/server/src/http/openapi-document.ts). It opens no connections, runs no request/domain handler and requires no database, SMTP, storage or network service. It does not replace database behavior with a mock.

`bun run api:generate` writes a deterministically ordered [OpenAPI artifact](../../packages/api-contract/openapi.json), invokes [openapi-typescript](https://openapi-ts.dev/node) in its own package, and formats both generated outputs with the pinned root formatter. [Generated interfaces](../../packages/api-contract/src/generated.ts) and the public types-only barrel are committed; generated files are never hand-edited. Library auth endpoints remain separately inventoried; unimplemented domain routes/test fixtures are not invented in the production contract.

The generator package pins TypeScript 5.9.3 locally, as approved in ADR-0020, with openapi-typescript 7.13.0. Root/application typechecking retains TypeScript 7. The script uses the local Node API/AST printer and no hosted conversion service. The contract package imports no runtime server code.

The MIT [admin client](../../packages/sdk/src/admin.ts) is a thin typed [openapi-fetch](https://openapi-ts.dev/openapi-fetch/) 0.17.0 wrapper. It imports only generated contract types; requests, responses and structured errors are inferred from paths. Default credentials are same-origin for the dashboard; non-browser callers supply an origin base URL and explicit credential headers. The independent public entry is `@backbricks/sdk/admin` through [admin/index.ts](../../packages/sdk/admin/index.ts); it does not bundle the future website SDK with management behavior. The existing package boundary rules remain unchanged.

Browser/Bun conditions use the typed source entry. The Node build emits ESM JavaScript with only the MIT fetch dependency at runtime, preserving Node >=20's native Fetch/Web API baseline; no AGPL server/core runtime is included. Build output is recreated to avoid stale artifacts. Dashboard wiring adopts this entry in P1.12.

## Evidence

[Generation tests](../../scripts/api/generate.test.ts) prove repeatable offline output, agreement with committed operation metadata, absence of internal/test/auth-handler details and package-local TypeScript resolution. [Client type/runtime tests](../../packages/sdk/src/admin.test.ts) reject missing/invalid selectors and payloads, exercise HTTP error handling on Bun and import the built public entry in the pinned Node runtime. [Real HTTP/Postgres integration](../../apps/server/src/admin-client.test.ts) creates/reads projects and keys and receives typed foreign-tenant denials through the generated client. Full `bun run check` includes these checks; drift/breaking gates follow P1.11c.
