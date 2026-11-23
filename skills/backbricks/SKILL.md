---
name: backbricks
description: Integrate Backbricks forms, private file uploads and published reviews into a website using a scoped CLI or MCP connection.
---

Use the [integration guide](https://backbricks.app/docs/cli) or run `backbricks docs --agent` for the same workflow offline.

1. Ask the owner for the deployment URL, project ID and allowed website origin. Use the AI agent preset. The owner provisions credentials in Project Embed and supplies the secret through the local environment.
2. Run `backbricks init` with the URL and project ID. Use the publishable key generated into `.env.local` in the website. Keep the secret in the local agent or server environment.
3. Edit the existing `backbricks.config.json`. Preserve the declared configuration version for existing instances. Omitted module sections preserve the server configuration. Explicitly empty sections archive instances in that module.
4. Run `backbricks validate` and `backbricks diff`. For MCP, use `config_get`, then `config_plan`. Review warnings and obtain separate approval for destructive changes before apply.
5. Apply the same desired configuration with its server plan hash. Run `backbricks codegen` and adopt the SDK in the site's own components.
6. Run `backbricks test submit forms/contact --data` with synthetic field values and `backbricks doctor`. The test entry checks non-file inputs. Verify a required upload through the public browser flow.
7. Check that review submission begins in moderation and that only published reviews are rendered.

For attachments, pass the ready upload's `fileRef` in the form file field. Treat file references and presigned URLs as temporary credentials. The project owner performs privileged operations such as creating keys and approving access changes.
