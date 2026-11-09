# ADR-0025: Private abuse identity and shared rate limits

- **Status:** accepted
- **Date:** 2026-11-06
- **Tasks:** P1.8c

## Context

Auth and public endpoints need consistent limits across server processes without retaining raw IP addresses (I11). Forwarded headers are client-controlled unless the connecting proxy is explicitly trusted. Postgres is the existing shared infrastructure; memory counters cannot enforce a multi-process limit.

## Decision

- [Core](../../packages/core/src/abuse/rate-limiter.ts) owns validated inputs and fixed-window semantics. Bucket identity is a 64-character digest; bounded namespaces separate auth, public and management operations. Window size and start are part of the key. Provider failures fail closed with a safe 503.
- [The Postgres store](../../packages/db/src/repositories/rate-limits.ts) atomically upserts the existing global UNLOGGED table. Counts saturate at the integer ceiling. It lives with the other Drizzle repositories, keeping table access inside the database package. It requires no tenant context because this technical table holds no tenant records. Production composition uses this store; the [memory adapter](../../packages/adapters/src/abuse/memory-rate-limiter.ts) is explicitly for tests/single-process use.
- [IP identity](../../packages/core/src/privacy/ip-identity.ts) canonicalizes addresses, including IPv4-mapped IPv6, before hashing. A domain-separated HMAC of `APP_SECRET` and the UTC date derives the daily key; another HMAC hashes the address. Only the resulting digest enters request context or rate buckets. Missing socket addresses fail closed.
- `TRUSTED_PROXIES` defaults to empty and accepts exact literal IP addresses only. No hostname resolution, implicit private-network trust, wildcard or CIDR matching. `X-Forwarded-For` is inspected right-to-left only while the current hop is trusted, stopping at the nearest untrusted hop. Oversized/malformed chains fall back conservatively to the socket peer. Other forwarding headers are ignored. Operators must configure their proxy to append/overwrite this header correctly.
- [Server middleware](../../apps/server/src/middleware/client-identity.ts) obtains the peer through the installed Hono Bun adapter and immediately hashes it. Auth integration consumes this identity in P1.1b; service-container composition of the limiter is P1.8d. No auth/public-write route exists yet.

## Consequences and evidence

No Redis or new runtime dependency. The deployment must use synchronized system clocks; fixed windows allow bursts around a boundary. Daily rotation deliberately changes IP identity at UTC midnight. Expired bucket cleanup remains P1.10c.

`bun test packages/db/src/rate-limits.test.ts` proves exactly 12 accepted requests out of 80 concurrent attempts across independent connection pools, namespace/identity separation, reset/retry timing and integer saturation against real Postgres. Core tests cover normalization, daily rotation and forged forwarding. A real Bun HTTP test proves socket-based hashing and absence of raw addresses in access logs. `bun run check` passes with compose services running.
