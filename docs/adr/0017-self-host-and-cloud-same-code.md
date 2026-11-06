# ADR-0017: Same code for self-hosted and cloud, differences only via dependency injection

- **Status:** accepted
- **Date:** 2026-11-04
- **Related:** ARCHITECTURE §0 #16, §G.5, §G.6; AGENTS.md I14, I15; PLAN P0.4, C1

## Context

The open-source release comes first, the managed cloud later. Maintaining a fork or feature flags spread through modules would be expensive and would erode trust in the open-source edition.

## Decision

**One codebase. `DEPLOYMENT_MODE=self_hosted|cloud` selects implementations at startup through dependency injection:** `entitlements` (`unlimited` vs. plans), `billing`, sign-up policy and similar. Cloud-only code lives in the narrow `cloud/` package. **Modules contain no `if (cloud)` branches.**

## Consequences

- Self-hosters get the complete platform; no feature lock in the core.
- Cloud-specific behavior is testable by swapping implementations.
- Every difference needs an interface in the core first, which keeps the surface small and explicit.

## Alternatives considered

- **Separate cloud fork:** double maintenance. Rejected.
- **Feature flags inside modules:** scatters cloud logic and violates I15. Rejected.
