# Contributing to Backbricks

Thanks for your interest! This project follows the rules in [AGENTS.md](AGENTS.md). They apply to human contributors and AI agents alike. The most important ones: think in the whole system, reuse before you write, one source of truth per concept, respect module boundaries.

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

## Releasing (maintainers)

User-visible changes come with a changeset (`bun run changeset`, see [`.changeset/README.md`](.changeset/README.md)). The product version is the version of `@backbricks/server`.

1. On an up-to-date `main`, run `GITHUB_TOKEN=<token with read:user and repo:status> bun run release:version`. It bumps `@backbricks/server` and writes `apps/server/CHANGELOG.md` with links to the pull requests. Commit the result (`chore(release): vX.Y.Z`) through a pull request.
2. After it is merged, create and push the signed tag: `git tag -s vX.Y.Z -m vX.Y.Z && git push origin vX.Y.Z`. Agents never tag or push.
3. The **Release** workflow checks that the tag matches the server version, builds the image exactly like CI, smoke-tests it and pushes `ghcr.io/nolliebigspin/backbricks:X.Y.Z` (plus `X.Y` and `sha-…`) with the workflow's own token. A manual run (Actions → Release → Run workflow) builds and smoke-tests without pushing unless "Push the image" is ticked.

## Developer Certificate of Origin (DCO)

We use the [Developer Certificate of Origin 1.1](https://developercertificate.org/) instead of a CLA. By adding a `Signed-off-by` line to a commit, you certify that you wrote the contribution or otherwise have the right to submit it under the project's licenses (see [LICENSING.md](LICENSING.md)).

Sign off every commit with:

```bash
git commit -s -m "feat(forms): add honeypot field option"
```

This adds `Signed-off-by: Your Name <you@example.com>` using your Git identity. The `commit-msg` hook (installed by `mise run setup`) rejects unsigned commits locally, and CI rejects pull requests with unsigned commits. To fix the last commit: `git commit --amend -s --no-edit`. For several commits: `git rebase --signoff main`.

## AI-assisted contributions

AI coding agents are welcome. [AGENTS.md](AGENTS.md) is written for them, and most tools read it automatically (Claude Code via `CLAUDE.md`). The rules:

- **You are the author.** Your `Signed-off-by` certifies the whole change, including what an agent wrote. Review and understand every line before you sign off, and be ready to explain it in review.
- **Disclose it.** Tick the AI box in the pull request template and name the tool.
- **No unattended agent PRs.** Pull requests that were clearly not reviewed by a human (wrong scope, invented APIs, ignored review comments) get closed.
- **Keep the scope small.** One issue per PR, as AGENTS.md §1 says. Agents tend to "improve" nearby code; leave it out of the PR.
- The roadmap workflow (AGENTS.md §9, `PLAN.md`) is for maintainers working through the milestones. For an issue you don't need it.

## Reviewing pull requests locally

Some files run code on your machine or steer your agent: `.mcp.json`, `.claude/`, `AGENTS.md`, `CLAUDE.md`, `mise.toml`, `lefthook.yml`, `package.json` scripts, `scripts/` and `.github/workflows/`. Before you check out someone else's branch, read the diff to these files on GitHub. If the branch changes them, start your agent only after you've read the change. These paths are listed in [`.github/CODEOWNERS`](.github/CODEOWNERS) and need a maintainer's review.

## Licensing of contributions

Contributions to `packages/sdk`, `packages/cli`, `examples/` and `skills/` are licensed under MIT; everything else under AGPL-3.0-only. See [LICENSING.md](LICENSING.md).

## Security

Never report vulnerabilities in public issues. See [SECURITY.md](SECURITY.md).

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).
