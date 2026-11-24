# Backbricks

Backbricks provides headless Forms, private Uploads, and Reviews for any website. Build the frontend with the API, TypeScript SDK, CLI or MCP. Site owners manage submissions, attachments and moderation in a dashboard.

See [milestones](docs/MILESTONES.md) for the current source and release status. The self-hosted platform comes first. Managed EU cloud is planned after 1.0.

| Module | Website integration | Dashboard |
| --- | --- | --- |
| Forms | JSON or native HTML submissions with validation and spam protection | Inbox, notifications, CSV and retention |
| Uploads | Direct uploads with content checks and optional malware scanning | Private downloads, deletions and storage usage |
| Reviews | Submit reviews and read published ratings | Moderation, publishing and statistics |

## Try locally with Docker

Install Docker with Compose v2. From a checkout, start the local preview. Compose installs the application dependencies inside containers.

```sh
docker compose --profile storage up -d
```

1. Sign up with a local test address at <http://localhost:5173/signup>. Open the verification email at <http://localhost:8025>.
2. Create an organization and a project. Add your test page's origin under **Allowed websites**.
3. Create a Contact form in **Inbox**. Use its **Embed** tab and a publishable key to submit from your page. For a plain HTML form, turn off the browser check and configure a success redirect in the form settings.
4. Find the result under **Entries**. To try an agent integration, open **Project Embed → Connect an AI agent**.

Follow the [published integration docs](https://backbricks.app/docs) and [HTML examples](examples/html/README.md). The [CLI and MCP guide](https://backbricks.app/docs/cli) includes source-build commands and dashboard administration examples.

### Modules and storage

```sh
BACKBRICKS_MODULES=forms docker compose up -d
BACKBRICKS_MODULES=reviews docker compose up -d
BACKBRICKS_MODULES=forms,uploads SCANNER=clamav docker compose --profile storage --profile scan up -d
```

For unscanned uploads, run the Uploads-enabled stack with `SCANNER=none` and explicitly choose an unscanned upload area. A protected area fails closed if scanning is unavailable. The dashboard proxies the API on the development `PUBLIC_URL` (`http://localhost:5173`). See [Compose](compose.yaml) for ports and [storage setup](docs/storage-contracts.md) for browser origins and provider checks.

## Run the preview image

The published 0.1.0 image serves Forms. Use [`.env.example`](.env.example) to configure PostgreSQL, `BACKBRICKS_MODULES=forms`, a unique `APP_SECRET` and an HTTPS `PUBLIC_URL`.

```sh
docker run --rm --env-file .env ghcr.io/nolliebigspin/backbricks:0.1.0 migrate
docker run -d --env-file .env -p 3000:3000 ghcr.io/nolliebigspin/backbricks:0.1.0 all
```

For this published preview image, use `SIGNUP_POLICY=open` to create and verify the first owner account, then switch back to `invite_only`. The verified target is Linux amd64. See [deployment architecture](docs/ARCHITECTURE.md#g4-self-hosting-docker-compose) and [storage operations](docs/storage-contracts.md#operations).

For all three modules, run the local Compose preview above. The [source deployment runbook](deploy/compose/README.md) covers the pre-release production setup, including TLS, first-owner setup and backups.

## Contribute

- [Contributor workflow](CONTRIBUTING.md) covers setup, tests, DCO and releases. [AGENTS.md](AGENTS.md) gives coding agents the repository rules.
- [Architecture](docs/ARCHITECTURE.md), [module catalog](docs/MODULES.md) and [ADRs](docs/adr/) explain the system.
- [Execution plan](PLAN.md) shows the next tasks and blockers.
- Report vulnerabilities through the private channel in [SECURITY.md](SECURITY.md). See the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

The platform is [AGPL-3.0-only](LICENSE). The SDK, CLI, examples and integration skill are MIT-licensed. See [licensing](LICENSING.md) and the [trademark policy](TRADEMARKS.md).
