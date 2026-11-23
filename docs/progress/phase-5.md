# Phase P5 · Agent-ready (M5, v0.4.0)

- **Branch** · `feat/p5-agent-ready` from `7aadc46`.
- **Scope approval** · Q24–Q27 approved for implementation on 2026-11-23.
- **Implementation review** · The standards and spec reviews identified credential target binding, parse-error redaction, private database errors, file-write races, instance-key parity, destructive plan visibility, generated type checks, MCP acceptance and docs gaps. The implementation addresses those findings. The maintainer approved opening the milestone PR. The formal phase review follows separately.

## Delivered

| Area | Change |
| --- | --- |
| CLI and config | A Node 20 and Bun binary with scoped credentials, idempotent site setup, offline schema validation, plan/apply, type generation, test submit, key inventory, diagnostics and offline help. [CLI commands](../../packages/cli/src/index.ts) |
| SDK and packaging | Shared JSON transport, read retries, lazy PoW worker, independent admin export, deterministic size gate and two self-contained npm tarballs. The published SDK declaration tree contains generated contract types. [SDK](../../packages/sdk) · [Packaging](../../scripts/release/package-clients.ts) |
| MCP | Stdio tools use the same CLI operations. The server recognizes scoped mutation paths, verifies config plan hashes and records the authenticated key as the MCP actor. [MCP tools](../../packages/cli/src/mcp.ts) · [MCP routes](../../apps/server/src/routes/mcp.ts) |
| Docs and examples | Starlight docs, Scalar, the packaged config schema, generated problem pages, crawler guides, agent skill and headless Next.js, Astro and HTML integration examples. [Source docs](../integration/) · [Examples](../../examples/) |
| Dashboard | Session-authorized agent key creation, one-time reveal and a copyable prompt without credentials. [Project Embed](../../apps/web/src/dashboard/embed.tsx) |

## Verification

| Check | Evidence |
| --- | --- |
| Scenario A | Chromium passed the packaged CLI and SDK journey. It linked a fresh project, applied the three modules, compiled generated types in an external consumer, created a flagged test entry, uploaded and claimed a scanned PDF, submitted a real review and displayed it after admin publication. The packaged stdio server created a separate form and the API verified its MCP actor. [Scenario A](../../e2e/scenario-a.spec.ts) |
| Claude Code | Registered the packaged stdio server in an isolated temporary project and invoked `form_upsert` through Claude Code. The local API verified the created form and the authenticated MCP audit row. |
| Packages and SDK | Built and installed both candidate tarballs in a clean directory. `npx` and all three SDK exports worked on Node 20.20.2. `bunx` launched the CLI on Bun 1.4.4. The public browser root measured 4,528 gzip bytes (8,000-byte budget) and Scenario A verified a proof worker in Chromium. |
| Doctor | Subprocess coverage injects a synthetic public Next.js secret, verifies exit 6 and checks stdout/stderr for redaction. A separate regression proves workspace links cannot redirect an ambient credential. [CLI tests](../../packages/cli/src/cli.test.ts) |
| Docs and examples | Chromium loaded the production docs, used Pagefind, rendered Scalar, and fetched the problem page, schema and agent guide. A production Next.js server action submitted to a separate real form. The fixture server key was absent from public JavaScript. [Docs test](../../e2e/docs.spec.ts) |
| Wizard | Chromium at 390 px passed English and German wizard flows. The creation request uses the agent preset and the copied prompt excludes the revealed key. [Wizard test](../../e2e/keys.spec.ts) |
| Browser regression | The full Playwright run passed 21 scenarios, then the two focused wizard journeys passed. The native SDK browser acceptance independently proved upload progress, signed CORS and cancellation in Chromium. |
| Tenancy and image | The isolated HTTP/PostgreSQL suite passed all management route cases including new key, forms and MCP routes. Linux amd64 image `sha256:7fe6c8a02bce2251af2dea2b1e8007e397e46830b0fe5962491fc40da289addd` passed Forms-only, Reviews-only, unscanned Uploads-only, and Forms plus scanned Uploads smoke. Forms-only uses PostgreSQL with storage and scanner disabled. |
| Repository | `CI=true bun run check` passed 613 package tests and 113 script tests with zero failures. `bun run build`, `bun run api:check`, `bun run api:breaking --base v0.1.0` and `git diff --check` passed. |

## Implementation decisions

- Client packages use a packaged JSON Schema generated from the server's config **input** model. Write-time and deployment-specific constraints remain on the server.
- Environment-only keys can follow a local site link after explicit initialization verifies the destination. The client stores a key fingerprint in user-local credential storage for that check. `login` can save the credential for the selected API and project.
- The example workspace scripts run their pinned frameworks through Bun and both built with Node 20.20.2 on PATH. The Next.js example uses TypeScript 5.9.3 for Next's JavaScript compiler API. The monorepo remains on TypeScript 7. The Starlight pages allow hashes of exact pinned inline assets in their own Head component.
- [ADR-0078](../adr/0078-scoped-key-inventory.md), [ADR-0079](../adr/0079-test-form-submissions.md) and [ADR-0080](../adr/0080-mcp-audit-channel.md) record the accepted contract changes.

## Release handoff

The [M5 changeset](../releases/agent-ready-developer-preview.changeset.md) stays staged until the separate 0.2.0 Uploads and 0.3.0 Reviews previews have been versioned. M5 release candidates can be generated with `bun scripts/release/package-clients.ts 0.4.0`. The script produces tarballs and does not publish them.

Npm names and publisher permissions still need the maintainer's confirmation under Q2. For the public release, verify the authenticated publisher and provenance through the approved npm publishing environment, then verify both packages from a clean registry install. A local tarball check cannot establish registry ownership or GitHub OIDC provenance.

Both local npm publish dry runs succeeded. The registry reported that authentication is required for an actual publish.
