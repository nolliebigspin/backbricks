# ADR-0026: Dashboard auth runtime

- **Status:** accepted
- **Date:** 2026-11-06
- **Tasks:** P1.1b; refines ADR-0010/0021/0022

## Context

The transaction spike proved Better Auth can participate in an outer transaction. Production wiring also needs verification, reset, session privacy, signup policy, CSRF, bounded HTTP inputs and shared throttling. The pinned library's password reset consumes its token, while its email-verification JWT is idempotently accepted again after verification. That does not meet the plan's single-use requirement.

## Decision

- [The auth controller](../../packages/auth/src/dashboard-auth.ts) is the public integration boundary. It creates a request-bound Better Auth instance using an injected transactional adapter. The server composes the adapter with the db-owned generated schema. Both thrown failures and error responses roll back; failed actions discard response cookies. No raw auth handler or global auth instance is exported.
- [The closed endpoint allowlist](../../packages/auth/src/http.ts) admits only implemented auth lifecycle routes. Organization, account deletion, email changes, social providers and other library routes stay inaccessible until their explicit policy and transactional lifecycle are implemented. Organization integration remains P1.1c.
- Q6's invariant-preserving execution baseline is `SIGNUP_POLICY=invite_only` by default, injected into both the HTTP gate and library options. Development explicitly opts into `open`. Verification is required for login; signup never creates a session. Production bootstrap is still M6. No-SMTP signup/reset/verification requests return a clear capability error; existing verified accounts can log in. Invitation-bound signup/link fallback remains P1.1c.
- Production requires an HTTPS public URL and Secure/HttpOnly/SameSite=Lax cookies. HTTP test/development uses an explicit insecure-cookie exception. Trusted origin is the public URL's origin. Every POST requires that Origin and `X-Backbricks-CSRF: 1`. Cross-site email-link navigation is allowed for the bearer-protected verification/reset GETs. Callback URLs are independently restricted to the trusted origin before dispatch, including duplicate query parameters.
- Shared Postgres counters protect the entire allowlisted handler and apply a stricter credential/mail limit. Auth request bodies are read with a bounded stream. [Options](../../packages/auth/src/options.ts) own limits and expiry constants; no duplicated per-route settings.
- Disable library IP tracking and overwrite session create/update metadata with the already resolved daily IP digest and no user agent. Disable cookie session caching so membership/session changes can be checked against storage. Browser JSON omits session bearer tokens and network metadata; credentials travel in HttpOnly cookies.
- Library verification identifiers are stored hashed. Email JWT consumption uses a separate digest-only, expiring global [replay table](../../packages/db/src/schema/technical.ts). Its atomic claim enlists in the same outer transaction; concurrent verification allows one success, and a failed verification rolls back its claim. It is distinct from proof-of-work replay state. P1.10c purges expired claims.
- Templates are rendered during dispatch, but SMTP starts only after commit. Delivery does not delay anonymous responses; a response-time floor reduces account-existence timing signals. In-flight delivery drains on shutdown. Failed SMTP reports only a safe event name. No bearer link enters events, audit or logs. Durable, expiring delivery/retries remain P1.10b; a process crash can lose in-memory pending mail until then.
- Suppress library error diagnostics and convert unexpected failures to a generic response plus a fixed event name. Auth access logs use route templates, masking reset-token paths. General API-key value redaction remains P1.4c.

## Evidence and consequences

`bun test apps/server/src/auth.test.ts apps/server/src/auth.security.test.ts` starts real Bun HTTP servers with the application middleware and isolated migrated Postgres databases, delivering to local Mailpit. It covers signup/verification/login/logout, concurrent verification replay, reset expiry/replay/session revocation, production cookies, expired sessions, origin/CSRF/callback rejection, body limits, throttling, raw plugin bypass and missing SMTP. Database failures prove verification claims and account writes roll back; a deferred commit failure sends no verification mail and emits no raw diagnostic.

The response floor is a mitigation, not a guarantee of constant time under load. The underlying auth library uses its own wall clock for token/session expiry; our replay retention uses the injected clock. Identity lifecycle hooks require a new request-bound instance and hold a connection during dispatch. No external SMTP I/O is awaited in that transaction. These are acceptable initial costs; optimize only with evidence and without weakening isolation/auditing.

`bun run check`, `bun run build` and `bun run test:e2e` validate the integrated change. Browser tests at this step remain the existing dashboard smoke suite; complete auth/dashboard acceptance is P1.12/P1.13.
