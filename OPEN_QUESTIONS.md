# Maintainer decisions

Resolve these at their task gates. Record approved architecture decisions in [ADRs](docs/adr/). [Historical decisions through M5](https://github.com/nolliebigspin/backbricks/blob/a9fc3188aeca064fcbb87ea63911d0d713fcf362/OPEN_QUESTIONS.md) retain prior Q and D references.

## Q2

**Who owns and can publish the npm packages?** Public lookups for `backbricks` and `@backbricks/sdk` returned 404 on 2026-11-23. The maintainer needs to confirm the names, publisher access, and the trusted publishing/provenance setup before the M5 npm preview or M6 release. Local tarballs already passed dry-run checks. [M5 evidence](docs/progress/phase-5.md#release-handoff)

## Q28

**Which interactive sign-in should the CLI use for session-only administration?** Prefer browser-mediated user authorization that preserves the existing role and session checks and the authenticated user in the audit trail. Project keys remain the automation credential for scoped operations. I7 requires a dashboard session for key creation, so the CLI must preserve that requirement, including an authenticated browser step if the design needs one. P6.9 implements the existing dashboard sign-in endpoint and private per-deployment session storage. The server controls expiration and revocation. Review the terminal flow decision in [ADR-0081](docs/adr/0081-cli-dashboard-authorization.md). [Authorization baseline](docs/adr/0028-management-principals-and-permissions.md)

## Q29

**Who signs off on the 1.0 license, trademark and release?** The maintainer arranges the license/trademark review, approves publication, and assigns the signer and publisher before P6.7b. [Licensing](LICENSING.md) · [Trademark policy](TRADEMARKS.md) · [Release workflow](CONTRIBUTING.md#releasing-maintainers)
