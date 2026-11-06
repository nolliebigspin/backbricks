# ADR-0046: Public write guard and project-bound CORS

- Status: Accepted
- Date: 2026-11-06
- Task: P1.9b

## Context

Optional modules need one public request pipeline before domain writes exist. HTTP validation must not run the domain body schema before honeypot/proof checks. Tenant transactions must not hold a pooled connection while a global limiter or proof replay store requests another connection.

## Decision

The [module contract](../../packages/core/src/modules/contract.ts) adds a pure `publicWritePolicy(config)` hook. Its validated defaults, public route access declarations, transport envelope and spam context live in [core policy schemas](../../packages/core/src/abuse/policy.ts). Public write routes declare the exact secret scope that skips proof and may declare a quota against their own registered usage metric. Instance keys bind public requests to active instances; no management membership is granted by a publishable key.

JSON uses `{data, proof?, honeypot?}`: domain data is validated by its existing module schema, while proof metadata belongs to the provider. The configured honeypot field is also removed from object data. Nonempty honeypots return a fixed public 200 acknowledgement and persist nothing. Accepted suspect/spam data reaches the module with a structural verdict; the guard never drops it.

The [guard](../../packages/core/src/abuse/guard.ts) reads scoped project/instance configuration, releases that transaction, then enforces exact byte limits, shared IP/instance, project and global rate buckets, origins, honeypot, signed single-use proof, strict domain schema and heuristics. Only then does it start the domain transaction, lock the project, recheck active instance/version, origins and key validity/scopes, check quota, and invoke the module in that same transaction. This makes quota/domain/usage/outbox rollback atomic without pool reentry. Secret exposure rejection remains the existing audited resolver path.

The [central registrar](../../apps/server/src/http/api-routes.ts) can defer only public body validation. It registers the original schema in OpenAPI and a hidden runtime clone without body validation, preserving params/query validation, body limits, route inventory and management authorization. The [host executor](../../apps/server/src/public-executor.ts) supplies raw bytes and scoped credentials, and merges approved CORS headers onto the response. Domain handlers still receive one schema-transformed input and an allowlisted response.

[Preflight](../../apps/server/src/routes/public-cors.ts) is explicitly registered only for mounted public paths. Browsers must supply the publishable `key` query parameter for preflight because OPTIONS omits bearer values. It reflects only valid permitted origins and known methods/headers, varies on Origin and both requested method/header fields, and never allows credentials. Actual responses vary on Origin; management responses gain no CORS. The query credential name is reserved from module query schemas. Secrets are never accepted in URLs.

## Consequences and verification

The [test-only module](../../apps/server/test/public-module-fixture.ts) proves real HTTP/PG proof, replay, scope, size, chunking, honeypot, schema, verdict, quota, provider failure, CORS and usage/outbox rollback behavior. It is absent from the production catalog. Forms/HTML adapters remain M2; M1 supplies JSON transport only.

Q11 remains pending: this ADR does not widen I1. Production publishable authentication continues to fail closed until the exact-hash bootstrap decision is approved; tests inject an already-authorized ID directory followed by real scoped database checks.
