---
title: CLI and MCP
description: Configure a Backbricks integration from your editor or terminal.
---

The `npx` commands require a published npm package. To build the local preview, follow the [CLI source instructions](https://github.com/nolliebigspin/backbricks/tree/main/packages/cli).

Set `BACKBRICKS_SECRET_KEY` through your local environment. The dashboard shows a new secret key once.

```sh
npx backbricks init --base-url https://backbricks.example.com --project "$BACKBRICKS_PROJECT_ID"
npx backbricks docs --agent
```

Edit `backbricks.config.json`, then run `validate`, `diff`, `push --yes`, `codegen` and `doctor`. Keep the current configuration version when changing an existing instance.

From a linked site, register the MCP server in Claude Code:

```sh
claude mcp add backbricks -- npx backbricks mcp
```

A config plan is read-only. Applying it requires the plan hash and the matching configuration. The AI agent preset supports non-destructive configuration and synthetic form tests.
