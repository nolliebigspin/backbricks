# Contributing to Backbricks

Use the [setup commands](README.md#try-from-source) and [repository instructions](AGENTS.md). For milestone work, start with [PLAN.md](PLAN.md). For an issue, use its scope and acceptance criteria.

## Verification

Run the focused tests while editing. Before opening a PR, start the real dependencies and run the local CI gate.

```sh
mise run infra
mise run scan
CI=true bun run check
```

For browser tests, run `bun run build` and install Chromium with `bunx playwright install chromium`. The full suite includes Scenario A, which needs `bun scripts/release/package-clients.ts 0.4.0` before `bun run test:e2e`. Use `bun run test:e2e <spec>` for focused runs. [CI commands](.github/workflows/ci.yml)

Run `bun run api:generate` after changing route contracts. Review the generated patch and run `bun run api:check`. Keep test databases and storage isolated from deployment data. If expiry tests fail after laptop suspension, check the Docker VM clock against the host.

### Optional code navigation

Run `mise run codegraph -- init` to create a local index. With an existing index, use the CodeGraph MCP tool if your editor provides it, or run `mise run codegraph -- explore "<query>"`. Without an index, use `rg`. The index is local and ignored by Git.

## Pull requests

Branch from `main` and keep each PR focused. Use [Conventional Commits](https://www.conventionalcommits.org/) with the task or issue ID. Sign off every commit with `git commit -s` under your own identity to certify the [Developer Certificate of Origin](https://developercertificate.org/). The commit hook and CI check the sign-off. The pre-push hook runs affected checks. Fill in the PR template and wait for green CI before merge.

If you use a coding agent, review and understand every line before sign-off, and disclose the tool in the PR. Review changes to agent instructions, tool configs, setup scripts, Git hooks and workflows before loading or executing them. [.github/CODEOWNERS](.github/CODEOWNERS)

## Releasing (maintainers)

The product version is `@backbricks/server`. Add a [changeset](.changeset/README.md) for a user-visible change. Once a release is authorized:

1. Use the source revision for that release. Run `bun run release:version` with a GitHub token that can read the repository and user metadata. Review the generated version and changelog in a signed-off PR.
2. Create and push a signed tag matching the server version on the approved release commit. The [Release workflow](.github/workflows/release.yml) builds, smoke-tests and publishes `ghcr.io/nolliebigspin/backbricks:<version>`. A manual run can rehearse the build without publication.
3. For M5 and later, package clients with `bun scripts/release/package-clients.ts <version>`. Verify clean installs and publish through the approved npm identity with provenance. Track registry access in [Q2](OPEN_QUESTIONS.md#q2).

The remaining previews follow **Uploads 0.2.0 → Reviews 0.3.0 → Agent-ready 0.4.0**. Version Uploads from its [merge revision](https://github.com/nolliebigspin/backbricks/pull/14) with the active Uploads changeset. Carry forward the prior version/changelog and consumed changeset state, then activate the [Reviews](docs/releases/reviews-developer-preview.changeset.md) and [Agent-ready](docs/releases/agent-ready-developer-preview.changeset.md) changesets one at a time against their respective source. Changesets combines pending bumps for a package, so verify each bump and source boundary before its tag.

## Policies

[Code of conduct](CODE_OF_CONDUCT.md) · [Security reporting](SECURITY.md) · [Contribution licensing](LICENSING.md)
