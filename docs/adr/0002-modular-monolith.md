# ADR-0002: Modular monolith with process roles

- **Status:** accepted
- **Date:** 2026-11-04
- **Related:** ARCHITECTURE §0 #1, §A.1, §C.3, §J.2 #7; PLAN P0.5b, P0.8a

## Context

Backbricks must be operable by one maintainer and self-hostable by people with a single small server. Forms, uploads and reviews share most of their infrastructure (auth, tenancy, audit, events, abuse protection), and some operations span modules in one transaction (a submission that claims uploaded files).

## Decision

**One TypeScript codebase with separated domain modules on a shared core, shipped as one Docker image that starts in a role:** `serve` (HTTP), `worker` (jobs), `all` (both in one process), `migrate` (one-shot migrations) and `setup` (first-run setup, added in P6.2).

Module boundaries are enforced technically (dependency-cruiser, capabilities; see ADR-0019 and AGENTS.md I13), so a later extraction of a part (e.g. the scan worker) stays possible.

## Consequences

- Few moving parts: the smallest install is the app (`all`) plus Postgres.
- Cross-module writes run in one database transaction; no sagas.
- One release artifact, one version number.
- Module discipline depends on the architecture rules in CI; without them the monolith would erode.
- Scaling is vertical at first; `serve` is stateless and can be replicated later.

## Alternatives considered

- **Microservices:** 8–15 services to self-host, distributed transactions, unrealistic for a solo maintainer. Rejected.
- **Next.js full-stack app:** the dashboard needs no SSR, the public API needs precise control (CORS per project, body limits, streaming), and the worker is a separate process anyway. Rejected (see ARCHITECTURE §A.1).
