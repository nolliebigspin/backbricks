# ADR-0018: Open-source release first, managed cloud afterwards

- **Status:** accepted
- **Date:** 2026-11-04
- **Related:** ARCHITECTURE §0 #17, §I; docs/MILESTONES.md

## Context

Running a managed cloud means operating costs, on-call duty and legal obligations as a processor (DPA, TOMs, breach notification). The product and its community are not validated yet.

## Decision

**Milestones M0–M6 (open-source track, ending with `v1.0.0`) come first. The managed cloud (C1–C3) starts only after M6.** Cloud-relevant foundations (interfaces, `DEPLOYMENT_MODE`, tenant settings for RLS) are prepared but not built out early.

## Consequences

- The product is validated with self-hosters and contributors before operating costs start.
- Scope discipline: cloud features don't creep into earlier milestones.
- Revenue starts later; the cloud plan stays coarse until M6.

## Alternatives considered

- **Cloud first:** faster revenue, but operating burden and legal work before the product is proven. Rejected.
- **Both in parallel:** too much for one maintainer. Rejected.
