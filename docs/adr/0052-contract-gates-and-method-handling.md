# ADR-0052: Contract gates and method handling

- Status: Accepted
- Date: 2026-11-06
- Task: P1.11c

## Decision

`bun run api:check` invokes the same offline generator into an ignored temporary directory, compares both artifacts byte-for-byte and removes the temporary files. It reports drift without overwriting a contributor's edits. Committing regenerated output cannot bypass compatibility checking.

`bun run api:breaking` resolves a real base commit before checking for the contract in its tree. CI supplies the actual PR base SHA (or previous push commit) with complete history. Local runs use `merge-base HEAD origin/main`, with an explicit `--base` override for review. Missing history/refs are errors. Initial bootstrap is permitted only when that resolved commit has no contract; a missing current artifact is always an error.

The offline comparator is [oasdiff](https://github.com/oasdiff/oasdiff) pinned only in `mise.toml`. It compares `/v1` paths, fails on breaking errors, refuses external references and uses an empty explicit tool configuration rather than silently accepting repository ignore rules. It performs no hosted review/upload. The same drift/compatibility gates run in `check`, `check:affected`/pre-push and CI.

The [central registrar](../../apps/server/src/http/api-routes.ts) installs unsupported-method guards from its declared inventory. Existing methods and implicit HEAD continue to their registered handlers. A management guard authenticates and scopes using the path's declared read policy when present (otherwise its first declared policy), then returns a structured 405 and Allow. Unauthorized/foreign tenant requests retain 401/403/404 and get no Allow header. No domain handler executes for an unsupported method. Guards are tracked framework handlers, not invented OpenAPI business operations. Public guards disclose the same template/method set for all supplied IDs and never look up resource existence.

## Error contract correction

The new export regression test found that the multi-value Zod literal for RFC 9457 `status` was incorrectly exported by the installed generator as only `500`. The [wire schema](../../packages/core/src/errors/schema.ts) now uses a bounded integer plus catalog validation, preserving all actual HTTP statuses. Error codes remain catalog-validated at runtime but are documented as strings with `x-extensible-enum` from that same catalog. This follows the existing catalog rule that new codes may be added freely and avoids promising a closed response enum to clients. Domain response enums retain normal breaking-change enforcement; no comparator error is suppressed. This correction is part of the initial M1 contract before its first PR-base baseline.

## Evidence

[Gate fixtures](../../scripts/api/breaking.test.ts) create isolated Git history and prove additive v1 changes pass, endpoint removal/response type changes fail, other API versions are excluded, and missing refs/history never bootstrap. [Drift tests](../../scripts/api/check.test.ts) prove edited generated files fail without being overwritten. [Real HTTP tests](../../apps/server/src/methods.test.ts) prove authorized 405/Allow behavior, unauthorized/foreign tenant nondisclosure, project-bound secret behavior, public handling and unknown-path 404. The numeric status regression failed before the schema correction and passes after regeneration.
