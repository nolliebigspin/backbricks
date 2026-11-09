# ADR-0047: Atomic public idempotency

- Status: Accepted
- Date: 2026-11-06
- Task: P1.9c

## Decision

Public write routes opt into idempotency by selecting a declared JSON success status in the [public access schema](../../packages/core/src/abuse/policy.ts). The [shared helper](../../packages/core/src/abuse/idempotency.ts) validates the bounded header, stores its SHA-256 digest as the tenant/project-scoped key, and fingerprints canonical operation, instance, credential identity, params, query and sanitized domain data. Proof/honeypot transport metadata are excluded. Object member ordering is insignificant; other data changes conflict. Depth/node bounds precede canonicalization of untrusted data.

Only committed successes exist in the cache. The [guard](../../packages/core/src/abuse/guard.ts) checks an existing result after credential, active instance, size, rate, origin and honeypot checks, before proof consumption. It locks/rechecks project, key, origin and instance state before replay. A matching committed request therefore replays after its proof was spent; revoked credentials cannot retrieve a replay. A mismatched fingerprint returns 409.

Before a new domain invocation, the guard takes the same project row lock used by configuration changes, rechecks state and the cache, then checks quota and executes the module. It inserts the safe response in that same transaction as domain, usage and outbox writes. Concurrent secret-scoped or proof-disabled duplicates serialize and replay one committed result. A cache failure rolls everything back. Expired rows can be atomically replaced using the existing repository's expiry predicate.

Cache bodies use a strict acknowledgement allowlist: accepted=true, a validated resource TypeID and/or a structural status tag. Input content, arbitrary response fields and headers are not stored. Route output validation still runs first. Retention is one day (Q8); only SHA-256 request/key digests, the approved public result, status and timestamps are persisted.

## Limits and evidence

PoW replay consumption is deliberately independent of domain rollback (ADR-0045). Simultaneous browser requests reusing one proof may receive `proof_invalid` while the winning request is still in flight; they can retry the same idempotency key after commit. No in-flight request is represented as a successful cache record. A failed new write needs a fresh proof for another attempt.

The [real HTTP/Postgres suite](../../apps/server/src/idempotency.test.ts) runs twelve concurrent duplicates and proves one usage increment/event; changed input conflicts, sibling projects are independent, expiry allows reuse, failed domain/cache transactions leave no successful replay, and committed browser retries work with spent/omitted proof. Existing tenant repository tests enforce scoped cache access.
