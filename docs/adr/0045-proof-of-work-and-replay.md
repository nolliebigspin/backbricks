# ADR-0045: Proof-of-work and replay protection

- **Status:** accepted for the provider/scoped composition; publishable bootstrap remains gated by Q11
- **Date:** 2026-11-06
- **Task:** P1.9a; ADR-0012/0020

## Decision

The [ALTCHA adapter](../../packages/adapters/src/abuse/altcha.ts) uses altcha-lib 2.8.0's [v2 protocol](https://github.com/altcha-org/altcha-lib#api-reference) and SHA-256 derivation. Its runtime schema allowlists algorithm, fixed cost/key size/prefix, random nonce/salt, signed expiry and signature. Unknown/oversized/changed-cost payloads fail before expensive work. No third-party verification, cookies or tenant identifiers enter the challenge.

Purpose/project-separated HMAC keys derive from APP_SECRET. A solution for another project or deployment fails signature verification. Expiry is bounded to ten minutes and checked against the supplied clock before library verification; the library's own wall-clock expiry remains an additional fail-closed guard. No global time patch is used. The fixed-clock boundary test checks rejection exactly at expiry.

After validating proof/signature, the adapter consumes a signature through the shared [ReplayStore](../../packages/core/src/privacy/replay.ts) contract. Its [Postgres implementation](../../packages/db/src/repositories/pow-replay.ts) performs one atomic insert with conflict denial into the existing global technical table. It stores public random signatures and expiry only, with no tenant records, IPs or proof input. Consumption commits independently of a later domain write, so a rejected write cannot recycle spent work. Bounded cleanup follows P1.10c. Email verification retains its transaction-enlisted implementation through the same interface.

The [challenge service](../../packages/core/src/abuse/challenge.ts) bounds per-IP and project generation through the existing shared limiter, resolves a credential through an injected authentication port, verifies active project/origin via scoped repositories and issues the signed challenge. The HTTP route accepts bearer credentials or a publishable-only query credential; the latter supports plain HTML forms and authenticated CORS preflight. Secrets are never accepted in query parameters. Management credential behavior is unchanged.

The public [credential composition](../../apps/server/src/public-auth.ts) reuses existing secret resolution/exposure handling and scopes every post-bootstrap read. **No new publishable-key bootstrap lookup is implemented or wired without Q11 approval.** The production port fails closed while absent; HTTP tests inject a directory of IDs already obtained through authorized fixture setup and then recheck real scoped database state. P1.9a remains incomplete until that protocol/invariant gate is resolved.

## Evidence

`pow.test.ts` uses real PostgreSQL: twelve concurrent verifications of one valid proof produce exactly one successful claim. Wrong-project/secret, altered cost, expiry and replay fail. `challenge.test.ts` proves real HTTP validation, public output snapshots without tenant IDs, restricted origins, revocation and generation limits. Both run against migrated services; no database mock is used.

On this host, five SHA-256/cost-1000/prefix-00 solves took 19, 84, 5, 60 and 94 ms (mean 52.4 ms). This is an initial measured setting, not a claim about mobile/browser solve time. Verification remains bounded by the fixed parameter allowlist. Future SDK/device measurements may tune the policy without weakening signature/replay checks.
