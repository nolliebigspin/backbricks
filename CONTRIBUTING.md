# Contributing to Corbel

Thanks for your interest! This project follows the rules in [CLAUDE.md](CLAUDE.md). They apply to human contributors and AI agents alike. The most important ones: think in the whole system, reuse before you write, one source of truth per concept, respect module boundaries.

## Setup

Requirements: [mise](https://mise.jdx.dev) and Docker (Docker Desktop or OrbStack).

```bash
mise install
mise run setup   # bun install, git hooks (lefthook), local code graph
mise run dev     # dev environment in Docker Compose
```

## Workflow

1. Open or pick an issue; for larger changes, discuss the approach first (an ADR in `docs/adr/` may be needed).
2. Branch from `main`: `feat/…`, `fix/…`, `docs/…`, `chore/…`.
3. Make small, focused commits using [Conventional Commits](https://www.conventionalcommits.org/): `feat(forms): add honeypot field option`.
4. Run `bun run check` (the `pre-push` hook runs the affected subset automatically).
5. Open a pull request against `main` and fill in the template. CI must be green.

## Developer Certificate of Origin (DCO)

We use the [Developer Certificate of Origin 1.1](https://developercertificate.org/) instead of a CLA. By adding a `Signed-off-by` line to a commit, you certify that you wrote the contribution or otherwise have the right to submit it under the project's licenses (see [LICENSING.md](LICENSING.md)).

Sign off every commit with:

```bash
git commit -s -m "feat(forms): add honeypot field option"
```

This adds `Signed-off-by: Your Name <you@example.com>` using your Git identity. CI rejects pull requests with unsigned commits. To fix the last commit: `git commit --amend -s --no-edit`. For several commits: `git rebase --signoff main`.

## Licensing of contributions

Contributions to `packages/sdk`, `packages/cli`, `examples/` and `skills/` are licensed under MIT; everything else under AGPL-3.0-only. See [LICENSING.md](LICENSING.md).

## Security

Never report vulnerabilities in public issues. See [SECURITY.md](SECURITY.md).

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).
