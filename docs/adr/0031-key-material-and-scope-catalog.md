# ADR-0031: Key material and scope catalog

- **Status:** accepted
- **Date:** 2026-11-06
- **Task:** P1.4a; approved Q9 permission matrix

## Context

API credentials need a single protocol and safe storage/response projections before session-only creation and production authentication are wired. Grants must be explicit and must respect optional modules.

## Decision

[Key material](../../packages/core/src/keys/material.ts) uses Web Crypto CSPRNG bytes and rejection sampling for the existing 32-character base62 protocol. Bytes outside the largest multiple of the alphabet size are discarded, so each accepted symbol has equal weight. SHA-256 hashes the full prefixed credential. Creation returns separate one-time plaintext and persistence material: secret persistence has only hash/display metadata and a null public token; publishable persistence may retain its public token. Display metadata includes eight token characters, never the full secret.

The [metadata projection](../../packages/core/src/keys/metadata.ts) explicitly selects safe management fields and ISO timestamps, omitting lookup hashes, creator and tenant internals. Even a malformed secret row's public-token field is suppressed. HTTP creation/list endpoints remain P1.4b; these helpers alone do not expose a credential API.

The [scope catalog and presets](../../packages/core/src/keys/scopes.ts) are the source of truth for key issuance. The protocol's generic scope-name syntax remains shared by route declarations/audit metadata; issuance additionally requires a known catalog entry and an enabled module for module-dependent grants. Inputs are normalized to sorted unique grants. Unknown and explicitly disabled grants fail validation; they are never silently accepted. Presets return their effective enabled grants, and the creation service must reject an empty secret grant set. No wildcard or implied grant is added. In particular, the agent preset grants no personal-data, deletion, destructive, project administration or key-management rights.

Enabled-module validation snapshots its input. Production authentication in P1.4c must validate current effective grants before granting access; persisted syntax alone is not authorization. The current v1 module-specific grant entries refer to declared module types and do not imply those domain APIs are implemented or mounted in M1.

The scoped key repository's hash lookup now requires an injected time and excludes revoked or expired rows. Expiry is exclusive at the exact boundary. Its project context remains mandatory and active-project validation stays in `withTenant`. Tenant discovery for initial authentication is still P1.4c's narrow credential bootstrap (ADR-0024), not a public unscoped repository.

## Evidence and consequences

`bun test packages/core/src/keys packages/db/src/key-material.test.ts` covers exhaustive accepted byte mappings/rejected high bytes, both protocol kinds, the SHA-256 known vector, independently generated credentials, safe stored/metadata projections, exact expiry and revocation, real Postgres tenant isolation, and archived-parent rejection. Property tests cover malformed protocol delimiters and every enabled-module subset. Database tests inspect actual persisted rows through scoped repositories; no DB mocks.

The catalog, metadata and validity helpers are reused by P1.4b/c. No new dependency, key plugin, production route or infrastructure is introduced. Public-token lookup and notification handling remain later tasks.
