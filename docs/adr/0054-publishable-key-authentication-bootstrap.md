# ADR-0054: Publishable key authentication bootstrap

- **Status:** accepted — Q11 explicitly approved by the maintainer
- **Date:** 2026-11-06
- **Task:** P1.9a
- **Extends:** ADR-0034's secret-only bootstrap; resolves the Q11 gates recorded in ADR-0045/0046.

## Decision

The maintainer explicitly approved Q11 in this execution chat: “Approve Q11 and finish it (recommended).” I1's narrow authentication bootstrap now also permits publishable credentials. This changes no public request format and adds no general unscoped data access.

The [bootstrap repository](../../packages/db/src/repositories/credential-bootstrap.ts) shares one private exact-hash query. Two exported authentication factories bind fixed secret/publishable kinds; neither accepts an HTTP-selected kind. The query requires a 32-byte SHA-256 digest, an unrevoked and unexpired key and its active project, joined on both project and organization IDs. It projects **only key, organization and project IDs**, never names, tokens, hashes, scopes or business metadata. No handler, module capability or HTTP endpoint receives the query port.

Production `serve`/`all`, the offline registrar and real HTTP fixtures construct the publishable lookup explicitly. The [public resolver](../../apps/server/src/public-auth.ts) requires that dependency and then rechecks the credential under `withTenant`: current key/hash, exact ID, publishable kind and public token must match. Project validation and subsequent origin/instance/domain access remain scoped. Stale or mismatched candidates cannot grant access; revocation, expiry and archive remain immediately enforced. Secret authentication/exposure handling and the management prohibition on publishable credentials remain unchanged.

## Evidence

The existing challenge HTTP test was first changed to remove its injected ID directory; it failed with 503 before production wiring and passed afterward. Database tests prove fixed kind separation, exact hash/length matching, the three-field projection, exact expiry, revocation and project archive. A real HTTP/DB test injects foreign/sibling/wrong-key candidates and a stale candidate after revocation, proving every later lookup remains scoped and denied probes leave business/audit state unchanged.

The English/German owner journeys create actual publishable keys against the running application, fetch a public challenge, reject foreign origins and management use, and revoke the key before verifying challenge access is denied. Existing proof tamper/expiry/project-binding/concurrent-replay and secret-key tests remain required.
