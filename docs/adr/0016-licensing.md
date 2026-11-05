# ADR-0016: AGPL-3.0 for the platform, MIT for clients, DCO for contributions

- **Status:** accepted
- **Date:** 2026-11-04
- **Related:** ARCHITECTURE §0 #15, §G.3, §J.2 #9; LICENSING.md, TRADEMARKS.md, CONTRIBUTING.md; AGENTS.md I18

## Context

The project should be truly open source, protect the future managed cloud against resale by competitors, and put no license obligations on customer websites that integrate it.

## Decision

- **AGPL-3.0-only** for the server, dashboard, core, modules, adapters, UI, API contract and the `cloud/` package.
- **MIT** for `packages/sdk`, `packages/cli`, `examples/*` and `skills/*`. These never import AGPL code.
- Contributions under the **Developer Certificate of Origin** (`Signed-off-by`), no CLA.
- A **trademark policy** for the name and logo.

## Consequences

- Competing hosted offerings must publish their modifications (AGPL §13).
- Websites embed only MIT code; no AGPL obligations reach them.
- Relicensing later needs every contributor's consent; if dual licensing is ever wanted, switch to a CLA before the first external contribution.
- Dependency licenses must be compatible; MIT packages must not depend on copyleft code (license check before releases, P6.7).
- Legal review before `v1.0.0`.

## Alternatives considered

- **Apache 2.0 / MIT for everything:** anyone could resell the hosted service without giving back. Rejected.
- **FSL/BSL (source-available):** not OSI open source, contradicts the product promise. Rejected.
- **Open core:** risk of a crippled community edition. Rejected.
