# ADR-0077 · Conditional public review reads

- **Status** · Accepted 2026-11-22 (Q22)
- **Milestone** · P4.3c
- **Related** · ADR-0046, I5, I17

## Context

M4 adds publication-backed public data and conditional GETs. A review can become private when a moderator unpublishes it, when collection visibility changes or when retention expires. The public host also owns credential, origin and representation handling.

## Decision

Public GET operations opt in by declaring an empty `304` response. The host declares their `If-None-Match` header in OpenAPI and processes it after the existing authentication, CORS and read guards succeed and a `200` representation exists. Hash the exact projected JSON to produce a weak ETag. Use weak comparison for the header's entity tags and handle the standalone wildcard. Return a bodyless `304` with the ETag, cache policy and normal CORS/`Vary` values when it matches. Raw request headers stay in the HTTP host. The reviews list confirms the collection revision after reading rows. A concurrent config change returns a retryable conflict, which prevents projecting freshly published rows with an older visibility allowlist.

For these operations, the host permits `If-None-Match` in GET preflight and exposes `ETag` on the response so authorized cross-origin callers can send their own conditional requests.

Reviews list and stats send `Cache-Control: public, no-cache` and retain `Vary: Origin, Authorization`. Shared and browser caches can store the public representation and must revalidate it before reuse. The current representation determines the tag, so publication, privacy, configuration and expiry changes take effect through the same authorization and data path. This saves transfer on matching responses. It still evaluates the current representation on each revalidation. [HTTP Semantics §13.1.2](https://www.rfc-editor.org/rfc/rfc9110.html#section-13.1.2), [HTTP Caching §5.2.2.4](https://www.rfc-editor.org/rfc/rfc9111.html#section-5.2.2.4)

## Consequences

Existing operations retain their current caching behavior. Test conditional and unconditional reads, weak tags and lists, empty collections, ETag changes after moderation and expiry, and credential/origin rejection even when given a matching tag.
