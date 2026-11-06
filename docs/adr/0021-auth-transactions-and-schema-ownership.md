# ADR-0021: Auth transactions and schema ownership

- **Status:** accepted
- **Date:** 2026-11-06
- **Related:** ADR-0007, ADR-0010, ADR-0011, ADR-0020; ARCHITECTURE §B.3/§F.6; I1/I12; P1.1a, DEV-10

## Context

Better Auth owns identity, sessions, memberships and invitations; Backbricks owns tenant access and auditing. A successful administrative mutation must never survive a failed audit insert. An organization hook running after a write is not sufficient evidence of a shared transaction. Generated auth tables must also be available to platform foreign keys without a db→auth runtime dependency.

The disposable P1.1a spike ran on Bun 1.4.4, PostgreSQL 18.6, Better Auth / auth CLI / @better-auth/drizzle-adapter 1.7.18 and Drizzle 1.0.0-rc.5. The pinned source confirms that role-update hooks follow the write, and invitation acceptance changes invitation status before its inner member transaction and calls the after hook afterwards.

## Decision

**Wrap administrative auth HTTP operations in an outer database transaction, creating a request-scoped Better Auth instance bound to that transaction and injecting audit writes bound to the same transaction.** The auth adapter's inner transactions may use savepoints; they cannot commit outside the outer transaction.

- Auth HTTP dispatch and organization hooks are awaited inside the outer transaction. Any thrown error or HTTP error response causes rollback. Better Auth can convert exceptions into 500 responses, so checking only for a thrown exception is insufficient. Return successful responses/cookies only after commit; discard success cookies on failure.
- The composition root injects the transaction runner, auth factory and trusted request/audit context. The public auth package exports the wrapped integration, not an unguarded global auth instance. Server-side auth operations must use the same boundary.
- Resolve the actor from the authenticated session, not from a role hook's `user` (which can be the target). Bootstrap organization creation audits against its newly created organization inside the transaction. Auth-table access is the documented identity-layer exception to platform tenant repositories; it does not authorize direct access to platform tenant tables.
- Enumerate the pinned library's exposed organization endpoints and apply explicit per-operation policy. Unknown/unsupported endpoints fail closed. Organization deletion, ownership changes, role creation and optional team endpoints remain disabled until their audited lifecycle is supported. A raw `/api/auth/organization/*` call may never bypass the wrapper, policy or tenant isolation suite.
- Defer external mail until commit, eventually via an expiring restricted delivery mechanism. Do not await SMTP inside the transaction or publish a token-bearing event. Auth error reporting must use the application logger/safe error conversion; the default router can print exceptions even with `logger.disabled`.
- Generated auth tables live in `packages/db/src/schema`. The auth factory receives the schema and connection through injection; db does not import the auth runtime. The generator configuration cannot import its own missing output. A deterministic normalization step rewrites the generated legacy relations import when needed; generated files are never edited by hand.

## Evidence

Disposable files are in `/tmp/backbricks-p1-auth-spike/run` for this session. They are intentionally not production code or committed fixtures (P1.1a). Commands run:

```sh
mise run infra
# In the disposable project, using the repository's pinned Bun binary:
bun install
bun --bun run auth generate --config ./auth.ts --output ./schema.ts --yes
# Normalize: drizzle-orm's generated relations import → drizzle-orm/_relations.
bun --bun node_modules/drizzle-kit/bin.cjs generate
bun --no-env-file spike.ts
```

The script creates/drops a uniquely named database, applies the generated migration, and calls the real HTTP handler using session cookies. It checks:

| Operation | Success | Injected after-hook audit failure with outer transaction |
|---|---|---|
| Organization creation | organization, owner member and audit committed | 500; organization/member/audit absent |
| Invitation acceptance | accepted invitation, member and audit committed | 500; invitation still pending, member absent |
| Member role update | role and audit committed | 500; previous role preserved, audit absent |

All assertions passed. A control request using the stock adapter with `transaction: true` but **no outer transaction** returned 500 after audit failure while its organization remained committed. Thus the adapter option alone does not satisfy I12. CLI generation still needs the relations-import normalization with these versions. Generation without a schema emits a schema-mismatch diagnostic but succeeds; the production generator must avoid accidental startup side effects.

### Exposed organization surface in the spike

The runtime `auth.api` inventory reports these paths under `/api/auth/organization` (all POST unless marked GET):

`create`, `update`, `delete`, `set-active`, `get-organization` (GET), `get-full-organization` (GET), `list` (GET), `invite-member`, `cancel-invitation`, `accept-invitation`, `get-invitation` (GET), `reject-invitation`, `list-invitations` (GET), `get-active-member` (GET), `check-slug`, `remove-member`, `update-member-role`, `leave`, `list-user-invitations` (GET), `list-members` (GET), `get-active-member-role` (GET), `has-permission`.

This is a version-specific discovery result, not a second endpoint registry. P1.1c/P1.13 must derive/check the production inventory at runtime and assert that every operation is covered or disabled. Reproduce the spike behavior as durable integration regressions when the production auth integration lands; do not claim its policies, concurrency protections or tenant isolation are implemented by this spike.

Primary references: [organization hooks](https://better-auth.com/docs/plugins/organization), [adapter contract](https://better-auth.com/docs/guides/create-a-db-adapter). Installed 1.7.18 source and the real DB experiment, rather than current documentation alone, establish the transaction behavior above.

## Consequences

- I12 is achievable without a custom auth database or a best-effort audit queue.
- Each administrative auth request holds a DB connection until dispatch/audit completion. Keep the transaction bounded; mail and other external I/O must stay out of it.
- Request-scoped factory construction costs more than one singleton; measure later if needed, without weakening transaction binding.
- P1.1c still needs durable rollback/concurrency/policy tests. This proof does not replace them.

## Alternatives considered

- **Stock adapter transaction option plus after hooks:** failed the negative control; rejected.
- **Audit after commit or in a separate queue/transaction:** can lose the audit while preserving the mutation; violates I12.
- **Duplicate membership tables or reimplement organization business logic:** adds competing sources of truth; unnecessary after the successful wrapper proof.
- **Global mutable current transaction:** cross-request tenant/connection risk; rejected in favor of request-scoped injection.
