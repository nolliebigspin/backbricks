# ADR-0035: Services, usage and entitlements

- **Status:** accepted
- **Date:** 2026-11-06
- **Task:** P1.8d; ARCHITECTURE §C.4; ADR-0017/0019

## Context

Auth, key security and management routes independently constructed the same audit/event/mail/time services. Modules need a shared injected contract without raw database access, undeclared optional providers or deployment-mode branches. Monthly usage already has a scoped atomic UPSERT; the missing layer is validated service behavior and injected quota policy.

## Decision

[Core services](../../packages/core/src/services/container.ts) separate always-available pure/transactional services from optional external providers. A module view declares required and optional provider names. Missing required providers fail at composition; missing optional providers return null. Getter types permit only declared names, and runtime checks reject undeclared access even through JavaScript/reflection. Declarations/provider maps are snapshots and views are frozen. Modules receive no raw driver, full provider bag or unbound `withTenant` selector; their supplied tenant transaction remains the data authority. P1.6a binds these views when defining the module contract.

[Provider ports](../../packages/core/src/services/providers.ts) cover private storage, scanner, captcha, transactional queue and billing. Existing mail/rate interfaces are reused. These are interfaces only: S3 arrives in P1.8e, captcha in P1.9, queue in P1.10, scanner in M3 and billing in C1/C2. A captcha provider owns its challenge wire schema; vendor library types are not copied into the container. No absent provider is constructed or probed merely because its interface exists. Billing has no provider/plan implementation or M1 route.

[Usage service](../../packages/core/src/services/usage.ts) validates namespaced metrics and positive lossless bigint increments, derives the first day of the UTC month from the injected clock and uses the caller's repository transaction. The existing DB date/month-start/nonnegative constraints and atomic UPSERT remain the storage source of truth. It does not open a separate write transaction. Zero/negative counter increments are rejected; later daily gauges retain their separate semantics. PostgreSQL counter overflow fails/rolls back instead of truncating. Explicit historical reads require valid month-start dates. HTTP serialization of bigint values belongs to the read contract in P1.5b.

[Entitlements](../../packages/core/src/services/entitlements.ts) are injected policy. Self-hosting uses unlimited decisions with null bounds, including for values beyond JavaScript's safe integer range. Finite cloud providers must use the supplied transaction for concurrent quota enforcement; no cloud branch enters modules or usage counting. Plan/quota/billing implementation remains C1/C2.

The [server composition](../../apps/server/src/services.ts) constructs one clock/ID set, audit/event/usage service, rate limiter, entitlement policy and optional mailer per runtime. Auth, key security and project/key routes reuse these instances. Runtime shutdown drains auth/security deliveries before closing the shared mailer and DB. Test fixtures use the same composition and inject a clock at that boundary, rather than creating competing clocks for different domain services. Transaction-bound security notification throttling remains bound to the physical incident transaction.

## Evidence and consequences

`bun test packages/core/src/services packages/db/src/usage-services.test.ts` covers required/optional/undeclared access, alias mutation, absent providers, explicit-undefined normalization, UTC offset boundaries, strict periods/amounts, unlimited policy, 80 increments across two pools, tenant/project isolation, audit-triggered rollback and actual bigint overflow. The undefined-provider regression failed before normalization fixed it; absent providers cannot pass required-service checks.

`bun run check` reruns real auth, invitation, key, exposure and isolation tests over the shared composition. Provider adapters are deliberately not faked into production to satisfy a module declaration. M1 remains incomplete until the later adapter/registry/worker/dashboard tasks land.
