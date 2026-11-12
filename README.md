# Backbricks

**Backend bricks for any website: forms, file uploads, reviews and more. Pick the bricks you need, build any frontend on top. Built for AI coding agents, managed by humans.**

Your AI agent builds the frontend. Backbricks handles the functionality behind it: data processing, storage, security and a dashboard where non-technical site owners manage what comes in. No database, backend or storage to configure. Bring your own UI; Backbricks ships no widgets, iframes or CSS.

> **Status: developer preview (v0.1.0).** The platform core and the **Forms** module work end to end (milestone M2). Uploads and reviews follow; expect breaking changes before 1.0. See [`docs/MILESTONES.md`](docs/MILESTONES.md).

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

- **Self-hosted (free, AGPL-3.0):** the complete platform via Docker Compose, with your own Postgres and S3-compatible storage. No calls home, no feature lock. Modules are optional: enable only what you need and only the services those modules require are deployed (forms alone runs on just the app and Postgres).
- **Managed EU cloud (later):** the same code, operated for you. Planned after the open-source 1.0.

## Quickstart

Requirements: [mise](https://mise.jdx.dev) and Docker (Docker Desktop or OrbStack).

```bash
git clone https://github.com/nolliebigspin/backbricks.git && cd backbricks
mise install        # pinned tools: bun, node, lefthook, codegraph, gh, actionlint
mise run setup      # dependencies, git hooks, local code graph
mise run dev        # dashboard at http://localhost:5173, test emails at http://localhost:8025
```

Then, in the dashboard:

1. **Sign up** at <http://localhost:5173/signup>. The verification email arrives in Mailpit (<http://localhost:8025>).
2. Create an **organization** and a **project**. Under **Allowed websites**, add the address your test page runs on (e.g. `http://localhost:8080`).
3. Open the project's **Inbox** and create a form from the **Contact form** template.
4. On the form's **Embed** tab, create a publishable key and copy the code for your page: plain HTML (switch off the browser check and set a page after sending under **Settings**) or the SDK. [`examples/html`](examples/html) has both, ready to serve.
5. Send the form. The entry appears under **Entries**, and form notifications (Settings) arrive in Mailpit.

## Run the image

Every release publishes one image for all roles to `ghcr.io/nolliebigspin/backbricks` (`serve`, `worker`, `all`, `migrate`). With forms only, it needs nothing but Postgres:

```bash
docker run --rm --env-file .env ghcr.io/nolliebigspin/backbricks:0.1.0 migrate
docker run -d --env-file .env -p 3000:3000 ghcr.io/nolliebigspin/backbricks:0.1.0 all
```

The variables are documented in [`.env.example`](.env.example); set `BACKBRICKS_MODULES=forms`, a real `APP_SECRET` and the HTTPS `PUBLIC_URL`. Production Compose files and first-admin setup arrive with M6; until then the first owner signs up with `SIGNUP_POLICY=open`, after which you switch it back to `invite_only`.

**Migrations:** run the `migrate` role before starting a new version (it applies pending migrations under a lock and exits). v0.1.0 is the first release, so there is nothing to upgrade from. Release notes: [`apps/server/CHANGELOG.md`](apps/server/CHANGELOG.md) (written on release).

## Development

```bash
bun run check       # everything CI checks
bun run build && bun run test:e2e   # browser journeys (needs `mise run infra`)
```

Stack: Bun · TypeScript 7 · Turborepo · Hono · PostgreSQL + Drizzle · pg-boss · Better Auth · React + Vite + TanStack + shadcn/ui · oxlint/oxfmt · Playwright. Details and rationale: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

Development uses the dashboard's Vite URL (`http://localhost:5173`) as `PUBLIC_URL`, with API requests proxied to the server. Update `PUBLIC_URL` when changing the browser-facing address. Production authentication requires HTTPS. Signup defaults to `invite_only`; Compose and `.env.example` explicitly enable `open` for development with Mailpit. Verification is required before login. Runtime policy and the current auth surface are documented in [ADR-0026](docs/adr/0026-dashboard-auth-runtime.md).

## Documentation

- [backbricks.app](https://backbricks.app): website (source in [`apps/www`](apps/www))
- [Architecture](docs/ARCHITECTURE.md): decisions, data model, API, security, stack; reasons per decision in [ADRs](docs/adr/)
- [Milestones](docs/MILESTONES.md): roadmap (open source first, then cloud); tasks in [PLAN.md](PLAN.md)
- [AGENTS.md](AGENTS.md): engineering rules, invariants and the roadmap workflow for humans and agents

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) (DCO sign-off required) and the [Code of Conduct](CODE_OF_CONDUCT.md). Report security issues privately as described in [SECURITY.md](SECURITY.md).

## License

The server, dashboard and modules are licensed under the [GNU AGPL v3.0](LICENSE). The SDK, CLI, examples and agent skills are MIT-licensed, so integrating Backbricks never puts AGPL obligations on your website. See [LICENSING.md](LICENSING.md) for details and [TRADEMARKS.md](TRADEMARKS.md) for use of the name.
