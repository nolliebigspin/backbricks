# ADR-0022: Personal data lifecycles

- **Status:** accepted (maintainer explicitly approved Q8 on 2026-11-06)
- **Date:** 2026-11-06
- **Related:** I1/I4/I11, OPEN_QUESTIONS Q8, DEV-11, P1.2a/b, P1.10b/c; ARCHITECTURE §B.1/§F.4/§F.6

## Context

I11 originally required `expires_at` on every personal-data record. That works for submissions, audit and transient tokens, but the architecture did not define timed expiry for active accounts, memberships and notification recipients. Quietly making those records permanent or expiring active accounts arbitrarily would both misrepresent the intended lifecycle. Better Auth's tenancy exception is not itself a privacy exception.

## Decision

**Active identity/access and recipient configuration follow their explicit lifecycle. Personal records and transient security/delivery records retain bounded expiry.** The maintainer approved the Q8 recommendation explicitly; this ADR clarifies I11 rather than relying on an undocumented exception.

| Category | Retention/deletion rule |
|---|---|
| Auth user/account identity | Retained while the account is active; hard-delete on account erasure. Do not add arbitrary periodic account expiry. A future account-erasure route must implement the whole lifecycle before exposure. |
| Organization membership | Retained while needed for access; hard-delete on removal. No soft-deleted membership may grant access. |
| Notification recipient configuration | Retained while the rule is needed; hard-delete on rule removal or subject erasure. Omit from config-as-code and audit diffs. |
| Session, verification/reset and invitation | Use the generated library expiry and invalidate expired credentials at lookup; hard-delete expired rows through maintenance. Never log bearer values. |
| Domain personal records | Required indexed `expires_at`, derived from the instance retention policy; hard-delete through domain retention/erasure handlers. No scope change to P2–P4. |
| Audit | One year, indexed `expires_at`; omit email/readable actor labels and user-entered key names. Opaque actor IDs remain potentially personal. Purge through the bounded transaction-local maintenance override, not ordinary request code. |
| Idempotency cache | Tenant-bound and expiring; store only an allowlisted public response, never the original submitted personal content. |
| Outbox and queued delivery | General events contain safe metadata only. Token-bearing mail uses restricted expiring delivery references/payloads, with a deadline at or before token expiry and bounded failed/completed-job retention. No secrets in general events/audit or logs. |
| Rate limiting and abuse | IPs become rotating HMAC hashes before persistence/logging. Expire buckets/replay records; trust forwarding headers only under explicit proxy configuration. |

Do not infer a soft-deletion exception. Project archive vs. hard erasure is a separate Q7 decision; archiving configuration never substitutes for deleting personal records. All project-scoped technical records also carry `organization_id` and consistent parent references (I1), including idempotency.

## Consequences

- Generated auth tables need no arbitrary account/membership expiry column. Existing session/invitation expiry remains authoritative.
- Schema, services and cleanup tasks must classify records consistently. A delivery queue containing recipients/tokens is not exempt from privacy merely because it is technical infrastructure.
- Tenant personal-data export/erasure is only exposed once all enabled modules/identity lifecycle hooks it promises are implemented; no incomplete success response.
- Policy durations not already specified by architecture are centralized in the owning service's constants and documented with its implementation.

## Alternatives considered

- **Expire every active identity periodically:** arbitrary account loss; not the intended access lifecycle.
- **Leave I11 unchanged but quietly omit expiry:** creates an invisible invariant violation; rejected.
- **Store readable audit emails forever:** unnecessary personal data and contrary to audit retention; rejected.
