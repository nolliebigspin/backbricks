# Backbricks CLI

The CLI runs on Node ≥ 20 and Bun. Create a project and a scoped secret in the dashboard, then provide `BACKBRICKS_SECRET_KEY` in your local environment.

```sh
npx backbricks init --base-url https://backbricks.example.com --project "$BACKBRICKS_PROJECT_ID"
npx backbricks docs --agent
```

`login` stores a verified key for the selected API and project in the user configuration directory. On POSIX systems the credential file has mode 0600. `init` stores the site link in `.backbricks/target.json` and the publishable settings in `.env.local`. Keep both paths ignored.

Use `diff` before `push`. A destructive change requires `--allow-destructive`, confirmation and the server's destructive scope. Use `--yes` to confirm eligible writes in a script. `pull --yes` replaces local configuration with the current remote configuration. `validate` and `docs` work offline. `doctor` checks connectivity, allowed origins and public credential exposure.

`backbricks mcp` runs over stdio. Configure `BACKBRICKS_BASE_URL`, `BACKBRICKS_PROJECT_ID` and a locally supplied `BACKBRICKS_SECRET_KEY`, or run it from a linked site with stored credentials.

| Exit | Meaning |
| --- | --- |
| 0 | Success |
| 2 | Invalid command or input |
| 3 | Remote API or connection failure |
| 4 | Confirmation or destructive permission required |
| 5 | Local operation failed |
| 6 | Doctor found an integration or exposure problem |

Use `--json` for machine-readable command output. The MCP command uses JSON-RPC on stdout.

For local development, build the binary with `bun run --cwd packages/cli build` and run `node packages/cli/dist/backbricks.js --help`. The first use of an environment-provided key needs an explicit API URL from `--base-url` or `BACKBRICKS_BASE_URL`. A successful explicit `init` records the destination and a fingerprint in user-local settings so subsequent commands in the linked site can use the same environment key.
