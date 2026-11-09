# ADR-0028: Management principals and permissions

- **Status:** accepted
- **Date:** 2026-11-06
- **Tasks:** P1.3b; Q9 execution baseline

## Context

Declared route permissions must resolve to an authenticated tenant context before validation or business logic. Neither a client organization selector nor a stored active-organization claim proves membership. Session roles and project-bound key scopes must remain distinct, including when both credentials are present.

## Decision

- [Core authorization](../../packages/core/src/identity/management-authorization.ts) resolves one credential and checks the declared role/scope. Explicit Authorization takes precedence over cookies and never falls back after malformed, invalid, unavailable or insufficient key credentials. Publishable keys cannot manage data.
- [Principal schemas](../../packages/core/src/identity/principal.ts) retain only actor ID, role or scopes. Session identity projection includes verification status and a nullable organization selector; no email, bearer token or full session enters tenant context. Principals and scope arrays are frozen. `withTenant` copies/validates the principal again to prevent alias mutation.
- Sessions must be verified. Every request checks current database membership and confirms that the returned membership matches both organization and user. Organization path parameters take precedence over the optional `X-Backbricks-Organization-Id` selector, followed by the stored active organization. Conflicting selectors fail closed. A header or active-org claim never grants access by itself.
- [API registration](../../apps/server/src/http/api-routes.ts) derives tenant parameter names from the registered `/organizations/{…}` and `/projects/{…}` path segments, including aliases such as `{id}`. This is part of the manifest rather than a second handwritten selector list. A secret-key operation cannot be registered without a project parent. Project membership/parent existence is checked before role/scope denial, so foreign resources return 404.
- A key identity is bound to one organization/project. Every explicit selector must match it, and its project must exist and remain active. Organization-wide operations and session-only operations cannot gain key access through an accompanying cookie. Required scopes match exactly; no wildcard expansion. Scope syntax is shared by policies, persisted credentials and audit metadata.
- Unsafe session operations require the configured public Origin and `X-Backbricks-CSRF: 1`; foreign/cross-site session requests are rejected. Header-free same-origin GET/HEAD requests remain usable. A secret key with a foreign Origin is rejected defensively; **P1.4c still owns real credential discovery, auditing and notification of exposure**.
- [Server composition](../../apps/server/src/middleware/authorization.ts) injects Better Auth sessions, the identity repository and scoped project validation. Without a key resolver, key authentication fails closed. Production key lookup is not implemented by this task. Synthetic tests supply a fixture credential directory backed by real scoped Postgres reads, not a fake database.
- Missing/invalid authentication returns 401; denied permission on an owned resource returns 403; foreign tenant resources return 404. Unknown provider exceptions become a safe 503. These statuses come from the core error catalog and use the RFC 9457 response.

## Consequences and evidence

Authorization is a per-request snapshot. Removed/demoted members lose permission on their next request; this does not cancel an already authorized in-flight request. Project handlers receive the trusted context through `requireTenantContext`, and tenant data still goes through `withTenant` repositories. Module service composition must retain that bound context (P1.8d).

Q9's conservative baseline remains session-only organization administration/project enumeration/creation/deletion and key management. Project-bound keys may use explicitly declared integration/project/config/statistics scopes. Later route tasks declare their exact permissions; no CLI key-management scope is silently added.

`bun test apps/server/src/authorization.test.ts apps/server/src/authorization.keys.test.ts` runs real HTTP/Postgres scenarios covering role changes, removal, stale claims, forged selectors, foreign/sibling projects, cookie/key conflicts, publishable denial, scope denial, provider failure, revocation and attributable transactional mutations. Core property tests cover credential syntax and secret-shaped scope rejection. The TypeID boundary regression confirms existing newline rejection; no parser change was required. Registration tests reject unbound key operations and verify derived parameter names. Full checks are run with `TURBO_FORCE=true` while shared test-input/cache coverage is addressed in P1.13a.
