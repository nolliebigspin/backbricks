# Integrate Backbricks

Ask the site owner for the deployment URL, project ID and an AI agent key. The owner sets the site's allowed origin and creates an active publishable credential in Project Embed. Supply the secret through the local environment as `BACKBRICKS_SECRET_KEY`.

Use the installed CLI from the site directory. The `npx` examples assume public npm availability. For a source preview, use the built CLI binary in place of `npx backbricks`.

```sh
npx backbricks init --base-url https://backbricks.example.com --project "$BACKBRICKS_PROJECT_ID" --yes
npx backbricks validate
npx backbricks diff
npx backbricks push --yes
npx backbricks codegen
npx backbricks doctor
```

Edit `backbricks.config.json` before running `diff`. Retain the current `configVersion` on existing instances. Omitted module sections preserve remote state. Empty sections request archival. Inspect the diff and obtain approval before allowing destructive changes.

Use the URL and publishable key written to `.env.local` to instantiate `createClient` from `@backbricks/sdk`. Attach an uploaded PDF using the returned file reference after the upload is ready. Add reviews with the public SDK and display published results through the same client. For a server action, read the separately scoped secret on the server.

Use `backbricks test submit forms/contact --data` with synthetic content to check the configured form fields. Complete a browser submission to exercise required attachments and the public origin.

Use `/v1/schema/config` on the selected deployment for its enabled modules. The packaged validator also works offline. Run `backbricks --help` for supported commands and output options.
