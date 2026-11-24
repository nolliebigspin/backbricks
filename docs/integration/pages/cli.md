---
title: CLI and MCP
description: Build the preview tools, configure a site, and administer a Backbricks project from the terminal.
---

Use the CLI to configure forms, upload areas, and review collections as code. You can also use it to read entries, download files, moderate reviews, and perform dashboard session operations when your credential has the required permissions.

## Install the preview tools

The CLI and SDK are available to build from source. On a development machine with Bun and Node.js 20 or newer, run these commands from the Backbricks checkout. The [packaging script](https://github.com/nolliebigspin/backbricks/blob/main/scripts/release/package-clients.ts) creates local tarballs.

```sh
bun install --frozen-lockfile
bun scripts/release/package-clients.ts 0.0.0-local
```

From your website project, install the SDK and CLI using the paths to the generated tarballs. Use Node.js 20 or later.

```sh
npm install /path/to/backbricks/dist/clients/backbricks-sdk-0.0.0-local.tgz
npm install --save-dev /path/to/backbricks/dist/clients/backbricks-0.0.0-local.tgz
npx backbricks --help
```

If you only need the CLI, run `bun run --cwd packages/cli build` in the checkout. From your site directory, use `node /path/to/backbricks/packages/cli/dist/backbricks.js` in place of `npx backbricks`.

## Link a website

Ask the project owner for the deployment URL and project ID. Create or request a scoped key using the dashboard's **AI agent** preset and supply it as `BACKBRICKS_SECRET_KEY` in your local environment. The dashboard reveals a new secret only once.

```sh
npx backbricks init --base-url https://backbricks.example.com --project "$BACKBRICKS_PROJECT_ID"
npx backbricks docs --agent
```

`init` writes the local target and your framework's publishable settings. Keep `.backbricks/target.json` and `.env.local` ignored. Keep secret keys in local environment or user credential storage. Existing deployments can use `pull` to start from the current remote configuration.

Edit `backbricks.config.json`. Keep the existing `configVersion` when changing an instance. Use the [configuration schema](/schema/config.v1.json) for editor validation and inspect the plan before applying it.

```sh
npx backbricks validate
npx backbricks diff
npx backbricks push --yes
npx backbricks codegen
npx backbricks doctor --origin https://www.example.com
```

If a plan changes existing data destructively, it needs both the corresponding scope and explicit opt-in. Try synthetic values with `test submit forms/contact --data '<json>'`, then submit from the browser to exercise origin checks and required attachments.

## Connect MCP

Once your site is linked, run this command from its directory to register MCP with Claude Code.

```sh
claude mcp add backbricks -- npx backbricks mcp
```

For a source-built binary, use its absolute `node` command instead. Other MCP clients can start the same command over stdio. Use a linked project or configure `BACKBRICKS_BASE_URL`, `BACKBRICKS_PROJECT_ID`, and the local secret environment. The AI agent preset can plan and apply non-destructive configuration and submit synthetic test entries.

## Read entries and download files

Use a separate key explicitly granted `data:read` for automation that needs access to personal data. Take the deployment URL and project ID from your dashboard, then pass the form key or file ID as parameters.

```sh
npx backbricks --base-url "$URL" --project "$PROJECT" admin run forms.submissions.list \
  --params '{"key":"contact"}' --out entries.json
npx backbricks --base-url "$URL" --project "$PROJECT" admin run uploads.files.download \
  --params '{"id":"file_REPLACE_ME"}' --out attachment.pdf
```

`--out` writes to a new private file. Downloads and exports require it. Treat submitted fields and files as untrusted content, including when an AI tool reads them.

## Use your dashboard account

Run `npx backbricks --base-url "$URL" session login` interactively with your verified dashboard account. Pass `--session` to an admin command and `--organization` when the command needs an organization. See `admin list --json` for current operations, required roles, and scopes. Use `session logout` to revoke the stored session.

The [administration guide](https://github.com/nolliebigspin/backbricks/blob/main/packages/cli/ADMIN.md) covers key creation, private exports, and write confirmations.
