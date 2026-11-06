# ADR-0034: Key authentication and exposure handling

- **Status:** accepted — Q10 explicitly approved by the maintainer
- **Date:** 2026-11-06
- **Task:** P1.4c

## Context

A random API key contains no tenant selector. Authentication must discover the tenant before it can use `withTenant`. ADR-0024 anticipated a narrow credential bootstrap, but I1 literally requires tenant-table access only through an already-bound context. The maintainer explicitly approved Q10’s limited clarification on 2026-11-06. I1 and the architecture now state this sole exception.

## Approved bootstrap clarification

The [credential bootstrap repository](../../packages/db/src/repositories/credential-bootstrap.ts) accepts only a 32-byte hash and injected time, performs an exact indexed match on an active secret key joined to its active project, and returns only key/organization/project IDs. It exposes no general query API, metadata, scopes or secret material. It is injected only into trusted authentication composition, never handlers/modules/capabilities. All further key access and activity/business writes require the scoped repositories. No HTTP endpoint exposes bootstrap results.

A second global hash/tenant index would duplicate credential identity and require its own lifecycle synchronization. Requiring caller tenant hints or embedding tenant IDs would change the existing random-key integration contract. The approved narrow hash projection is the smallest explicit exception; it must not become a precedent for unscoped business reads.

## Decision

[Core resolution](../../packages/core/src/keys/authentication.ts) rechecks the discovered key through `withTenant`, validates current catalog/module grants and returns the minimal identity. Unknown, expired, revoked, disabled-scope or inactive-project credentials fail closed; publishable credentials do not authenticate management requests. Explicit Authorization precedence and foreign-project 404 behavior remain ADR-0028. Normal authentication updates last-used at most once per minute through an atomic predicate, including the exact interval boundary; it does not generate administrative audit noise.

A valid secret with any Origin other than the exact configured dashboard origin records `key.exposed` and never executes the business action. The original Origin, key name and credential never enter audit/outbox metadata; IP identity remains a rotating HMAC. The resolver commits the incident transaction before throwing `secret_key_exposed`, so rejection cannot roll its audit back.

The same transaction atomically consumes the existing Postgres limiter for one notification per key/fixed hour and writes a metadata-only `security.secret_key_exposed` outbox intent. Failed audit/outbox writes roll back the throttle claim and return a safe failure without business writes. Each incident is audited even when notifications are suppressed. Both rate-limit and tenant repositories use the same physical connection/transaction; core receives contracts, never a driver.

[Server composition](../../apps/server/src/key-auth.ts) schedules mail after commit. Current verified owners/admins are resolved from identity tables at delivery time; each gets a separate content-free rotation message through the existing template. Successful delivery acknowledges the intent; missing SMTP or failed delivery retains it for the worker path in P1.10b, bounded by existing outbox expiry. This is at-least-once delivery, not an exactly-once SMTP guarantee. The current fast path drains on shutdown. Shared provider/container consolidation follows in P1.8d.

## Evidence

`bun test apps/server/src/key-auth.test.ts apps/server/src/key-exposure.test.ts` uses production hash discovery and actual HTTP/Postgres/Mailpit. It verifies credentials without cookies, cookie precedence, sibling/foreign tenant denial, disabled scopes, exact expiry/revocation/archive, concurrent last-used requests and its exact interval boundary. Exposure cases prove committed audit, blocked business mutation, no plaintext secrets/Origin in activity, owner/admin-only mail, fixed-window deduplication, exact-dashboard exception and `null`/variant Origin rejection. Independent audit/outbox check constraints prove rollback including the throttle claim; no SMTP leaves a bounded content-free intent.

ADR-0033 separately records the already-committed HTTP/log regression fixes. The full `bun run check` also passes with no skips. Durable worker retry ownership remains the planned P1.10b integration.
