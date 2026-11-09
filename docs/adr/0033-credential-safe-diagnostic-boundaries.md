# ADR-0033: Credential-safe diagnostic boundaries

- **Status:** accepted
- **Date:** 2026-11-06
- **Task:** P1.4c (HTTP/log sinks; production authentication remains subsequent work)

## Context

Field-name redaction missed a valid secret placed in a harmless field, message, request ID, path or error chain. A recursive depth limit returned the original subtree, permitting deep values to escape. The pinned Pino version resets the bindings formatter for ordinary child loggers, so a root bindings formatter alone cannot close that path.

## Decision

[Redaction](../../packages/core/src/logging/redact.ts) retains credential-bearing field-name masking and additionally masks complete secret-key protocol values embedded in text and property names. The alphabet, prefix and token length derive from the same [protocol constants](../../packages/core/src/keys/constants.ts) as generation/validation. Errors are copied to a safe diagnostic projection, functions/custom serializers are not carried across the boundary, and excess depth is masked rather than returned unchanged. Partial display excerpts remain usable; this does not claim detection of arbitrary unknown secrets or personal data embedded in free text.

The [logger](../../apps/server/src/logger.ts) sanitizes the final valid JSON line through Pino's supported `streamWrite` hook before any transport receives it. This covers messages after interpolation, default/custom serializer output, root fields and child bindings with one output boundary. It adds JSON parsing/copying overhead per log line; correctness takes precedence over a formatter optimization that omits child bindings. Callers must still avoid logging personal content and arbitrary provider diagnostics.

[Request context](../../apps/server/src/middleware/request-context.ts) replaces caller IDs containing the secret prefix and logs the responding registered route template, rather than concrete parameters or query strings. Auth retains its dedicated known-endpoint/reset-token masking. Unknown-route problems no longer echo a caller path. [Problem serialization](../../packages/core/src/errors/app-error.ts) applies the same redaction before publishing detail/hint/validation metadata, preserving the stable RFC 9457 codes and statuses.

## Evidence and consequences

Failing tests were added before the fix: three regressions demonstrated leaks through HTTP sinks, logger bindings/messages and recursive redaction. `bun test packages/core/src/logging/redact.test.ts apps/server/src/app.test.ts packages/core/src/errors/app-error.test.ts packages/core/src/keys` now passes, covering raw and percent-encoded unknown paths, route parameters, malicious request IDs, errors/causes, formatted messages, child bindings and custom serialization.

Normal reverse-proxy request IDs and harmless diagnostic text remain supported. Problem detail wording for unmatched routes changes without changing status/code. Access logs use templates and lose concrete resource identifiers deliberately. Production key discovery, incident audit/notification intent and last-used throttling are still unfinished parts of P1.4c.
