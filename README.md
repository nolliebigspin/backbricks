# Corbel

**Headless backend features for any website: forms, file uploads and reviews. Built for AI coding agents, managed by humans.**

Your AI agent builds the frontend. Corbel handles the functionality behind it: data processing, storage, security and a dashboard where non-technical site owners manage what comes in. No database, backend or storage to configure. Bring your own UI; Corbel ships no widgets, iframes or CSS.

> **Status: pre-alpha.** Architecture and roadmap are done; implementation starts with milestone M0. See [`docs/MILESTONES.md`](docs/MILESTONES.md).

## What it does (v1 scope)

| Module | For the website | For the site owner |
|---|---|---|
| **Forms** | Headless form API with server-side validation, spam protection, plain-HTML support | Inbox with search, status, CSV export, notifications, retention |
| **Uploads** | Direct-to-storage uploads with type/size limits and malware scanning | Browse, download and delete files; storage usage |
| **Reviews** | Collect reviews; public read API for published ones | Moderation queue, publishing, stats |

Integrate via **REST API (OpenAPI)**, **TypeScript SDK**, **CLI with config-as-code**, or the **MCP server** for coding agents. EU-first and privacy-first: proof-of-work instead of third-party captchas, hashed IPs, retention rules, GDPR export/erasure.

## Where it's heading

The three v1 modules are the start. The goal is to cover the interactive parts of a website from one backend and one dashboard: waitlists, event registration, surveys, polls, feature voting, comments, live chat, appointment booking, analytics, cookie consent, job postings, galleries, product catalogs and protected content. That means one tool instead of a dozen. Candidates and their status: [`docs/MODULES.md`](docs/MODULES.md).

## Self-host or cloud

- **Self-hosted (free, AGPL-3.0):** the complete platform via Docker Compose, with your own Postgres and S3-compatible storage. No calls home, no feature lock.
- **Managed EU cloud (later):** the same code, operated for you. Planned after the open-source 1.0.

## Development

Requirements: [mise](https://mise.jdx.dev) and Docker (Docker Desktop or OrbStack).

```bash
mise install        # pinned tools: bun, node, lefthook, codegraph, gh
mise run setup      # dependencies, git hooks, local code graph
mise run dev        # full dev environment in Docker Compose (available from M0)
bun run check       # everything CI checks
```

Stack: Bun · TypeScript 7 · Turborepo · Hono · PostgreSQL + Drizzle · pg-boss · Better Auth · React + Vite + TanStack + shadcn/ui · oxlint/oxfmt · Playwright. Details and rationale: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Documentation

- [Architecture](docs/ARCHITECTURE.md): decisions, data model, API, security, stack
- [Milestones](docs/MILESTONES.md): roadmap (open source first, then cloud)
- [Planning prompt](docs/PLANNING_PROMPT.md): how the MVP is planned and built with AI coding agents
- [CLAUDE.md](CLAUDE.md): engineering rules and invariants for humans and agents

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) (DCO sign-off required) and the [Code of Conduct](CODE_OF_CONDUCT.md). Report security issues privately as described in [SECURITY.md](SECURITY.md).

## License

The server, dashboard and modules are licensed under the [GNU AGPL v3.0](LICENSE). The SDK, CLI, examples and agent skills are MIT-licensed, so integrating Corbel never puts AGPL obligations on your website. See [LICENSING.md](LICENSING.md) for details and [TRADEMARKS.md](TRADEMARKS.md) for use of the name.
