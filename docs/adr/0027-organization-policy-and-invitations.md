# ADR-0027: Organization policy and invitations

- **Status:** accepted
- **Date:** 2026-11-06
- **Tasks:** P1.1c; refines ADR-0021/0026 and Q6/Q7

## Context

Better Auth supplies organization/member/invitation behavior, but its broad default HTTP surface is not the platform's permission contract. Administrative writes require atomic audit, role changes must preserve an owner under concurrency, and SMTP-optional invitations must also work for a new account without enabling general registration or password takeover.

## Decision

- [A single policy/input registry](../../packages/auth/src/organizations/policies.ts) controls the exposed library routes. Its read-only manifest declares a role or account/invitation scope and isolation case for each operation. Account scopes authorize only verified sessions to create a new organization or list their own memberships. Invitation acceptance requires a live token bound to the verified session's email. These are session capabilities, not scopes granted to API keys.
- [Request preflight](../../packages/auth/src/organizations/operation.ts) resolves the actor from the real stored session, locks the organization row and checks current membership/role and target ownership. Organization identifiers are selectors, never proof of access. Foreign organizations, member IDs and invitations return 404. Slug alternatives, member-email selectors, multi-role arrays, teams, arbitrary metadata and unimplemented library endpoints are not exposed.
- All membership/invitation mutations take the same organization lock. Last-owner removal/demotion and admin changes to owners are rejected. New owner grants, organization deletion and leave/transfer routes remain disabled as the conservative Q7 baseline. Existing/co-owned organizations can reduce ownership only while preserving an owner. No personal-data erasure is simulated.
- Administrative audit and metadata events run after successful library dispatch but **before the outer transaction commits**, through its injected `withTenant`. This uses the proven boundary from ADR-0021 without depending on an after-hook for each library implementation detail. Audit failure rolls back the library writes and discards success cookies. Session selection/refresh is an authenticated preference/lifecycle operation, not tenant administration.
- Audit records identify the requesting actor rather than the member being changed. Role changes record bounded enum values; no readable names/emails enter audit or events. Invitation IDs are bearer credentials, so audit/event targets use a digest of the ID. Full invitation links are restricted to the delivery mechanism or authorized owner/admin responses.
- SMTP invitation delivery uses the existing escaped template and starts after commit. Without SMTP, a successful invite returns a copyable link only to the authorized owner/admin. Anonymous callers and ordinary members cannot obtain that response. Reset/verification routes continue to expose no anonymous token fallback.
- [Invite-bound signup](../../packages/auth/src/organizations/invitation-signup.ts) is the sole exception to invite-only registration. It locks and rechecks pending status, expiry and matching email. Possession of the owner/admin-issued invitation authorizes this specific identity, including when the operator manually delivers the copyable link. It is not an anonymous claim of email verification.
- Only that request-bound auth instance permits registration and marks the new identity verified by invitation proof. Better Auth creates its credential/session and accepts the invitation inside the same outer transaction; membership audit must succeed too. Nothing is sent or returned before commit. Expired, canceled, replayed, mismatched or owner-grant invitations fail closed. Existing accounts cannot be replaced or have their password changed through signup; verified existing users accept with their own session.
- Duplicate query parameters are rejected before dispatch to prevent disagreement over which bearer token was validated/consumed. Normalized organization input is passed to the library after the narrower schema accepts it.
- Committed logins emit a fixed `auth.signed_in` operational signal with no identity, recipient, token or IP. Failed/rolled-back logins emit no success signal. A login precedes organization selection, so this is an explicit F.6 clarification: it is not tenant/account login history. Tenant administrative history remains transactional and attributable. Adding account-level login history would require a separate privacy/retention design.

## Evidence and consequences

`bun test apps/server/src/organizations.test.ts apps/server/src/organizations.transactions.test.ts apps/server/src/invitations.test.ts` covers seven real HTTP/Postgres/Mailpit scenarios: role/tenant isolation, immediate rejection after removal, unsupported raw route calls, audit failure across every administrative mutation category, concurrent owner demotions, authorized no-SMTP links, atomic new-account acceptance and existing-account password preservation. Two concurrent owner demotions produce one success and one rejection, leaving one owner. Constraint failures leave no unaudited mutation or invitation email.

`bun run check` passes with services running. The auth controller still uses in-memory post-commit delivery until P1.10b, and no organization hard-erasure/ownership-transfer workflow is claimed. Complete generated route/isolation coverage and dashboard flows remain P1.13/P1.12.
