# ADR-0046: Public write guard and project-bound CORS

- Status: Accepted
- Date: 2026-11-06
- Task: P1.9b

## Context

Optional modules need one public request pipeline before domain writes exist. HTTP validation must not run the domain body schema before honeypot/proof checks. Tenant transactions must not hold a pooled connection while a global limiter or proof replay store requests another connection.

## Decision

The [module contract](../../packages/core/src/modules/contract.ts) adds a pure `publicWritePolicy(config)` hook. Its validated defaults, public route access declarations, transport envelope and spam context live in [core policy schemas](../../packages/core/src/abuse/policy.ts). Public write routes declare the exact secret scope that skips proof and may declare a quota against their own registered usage metric. Instance keys bind public requests to active instances; no management membership is granted by a publishable key.

JSON uses `{data, proof?, honeypot?}`: domain data is validated by its existing module schema, while proof metadata belongs to the provider. The configured honeypot field is also removed from object data. Nonempty honeypots return a fixed public 200 acknowledgement and persist nothing. Accepted suspect/spam data reaches the module with a structural verdict; the guard never drops it.

The [guard](../../packages/core/src/abuse/guard.ts) reads scoped project/instance configuration, releases that transaction, then enforces origins, exact byte limits, rate buckets (IP/instance, then project, then global, consumed one at a time and stopping at the first denial so a rejected client never spends the shared budget), honeypot, signed single-use proof, strict domain schema and heuristics. Only then does it start the domain transaction, lock the project, recheck active instance/version, origins and key validity/scopes, check quota, and invoke the module in that same transaction. This makes quota/domain/usage/outbox rollback atomic without pool reentry. Secret exposure rejection remains the existing audited resolver path.

The [central registrar](../../apps/server/src/http/api-routes.ts) can defer only public body validation. It registers the original schema in OpenAPI and a hidden runtime clone without body validation, preserving params/query validation, body limits, route inventory and management authorization. The [host executor](../../apps/server/src/public-executor.ts) supplies raw bytes and scoped credentials, and merges approved CORS headers onto the response. Domain handlers still receive one schema-transformed input and an allowlisted response.

[Preflight](../../apps/server/src/routes/public-cors.ts) is explicitly registered only for mounted public paths. Browsers must supply the publishable `key` query parameter for preflight because OPTIONS omits bearer values. It reflects only valid permitted origins and known methods/headers, varies on Origin and both requested method/header fields, and never allows credentials. Actual responses vary on Origin; management responses gain no CORS. The query credential name is reserved from module query schemas. Secrets are never accepted in URLs.

## Consequences and verification

The [test-only module](../../apps/server/test/public-module-fixture.ts) proves real HTTP/PG proof, replay, scope, size, chunking, honeypot, schema, verdict, quota, provider failure, CORS and usage/outbox rollback behavior. It is absent from the production catalog. Forms/HTML adapters remain M2; M1 supplies JSON transport only.

Q11 remains pending: this ADR does not widen I1. Production publishable authentication continues to fail closed until the exact-hash bootstrap decision is approved; tests inject an already-authorized ID directory followed by real scoped database checks.

## P2.4a addendum (2026-11-09, D52)

Q11 is now resolved by [ADR-0054](0054-publishable-key-authentication-bootstrap.md). The first production module uses the same guard and scoped rechecks.

Public handlers receive the active instance ID, config version and validated config through the [public context schemas](../../packages/core/src/abuse/policy.ts). Writes additionally receive the spam verdict and minimized source: origin, Referer pathname without query/fragment, coarse browser family and rotating IP hash. The [host](../../apps/server/src/public-executor.ts) reduces headers before invoking the guard; raw IPs and User-Agent headers never enter the module context. These are internal execution contracts, never public response fields.

Public reads consume a separate 60-per-minute IP/instance bucket (D48), outside tenant transactions. The executor defaults to `no-store` and preserves an explicit handler cache policy; forms schema reads use `public, max-age=60` with `Vary: Origin, Authorization`. Writes still recheck configuration versions under the project lock and commit the submission, event and usage together.

P2.4a cache follow-up: public schema representations depend on the bearer credential as well as Origin. `public` permits shared caching even for authenticated requests ([RFC 9111 §3.5](https://www.rfc-editor.org/rfc/rfc9111.html#section-3.5)), so varying by Authorization prevents reuse across projects that share a form key and Origin. Query credentials already participate in the request URL. The regression failed with only `Vary: Origin` before the fix.

The [forms HTTP tests](../../apps/server/src/forms.public.test.ts) prove projection, real proof verification, honeypot handling, idempotent/concurrent retries, secret scope/exposure, minimized stored source and event/usage rollback. The [manifest-driven I5 gate](../../apps/server/src/public-responses.test.ts) covers both JSON responses and both preflights. No invariant or authentication bootstrap exception changes.
