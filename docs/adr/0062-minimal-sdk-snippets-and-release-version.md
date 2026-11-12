# ADR-0062: Minimal SDK transport, integration snippets and the product version

- **Status:** accepted during execution; D60 awaits maintainer confirmation
- **Date:** 2026-11-12
- **Task:** P2.8c, P2.9a, P2.9b, P2.10a; ARCHITECTURE §D.7, ADR-0045/0046, Q3/Q13, D50; I5/I8/I16/I18

## Context

M2 ships the first website integration: dashboard snippets, `examples/html` and a minimal SDK (`createClient`, `forms.submit`). ARCHITECTURE §D.7 describes the full SDK (P5.1) but not how the minimal one authenticates or when it solves proof-of-work. The plan also asked for a "fetch" snippet and a release version without saying which package carries it.

## Decision

**SDK transport.** Publishable keys travel as `?key=` on every request, never in an `Authorization` header. Browsers send no `Authorization` header on CORS preflights, and the server's public preflight (ADR-0046) needs the key to check the project's allowed websites. Secret keys use `Authorization: Bearer` and must never run in a browser (the server rejects them with an `Origin`, I6). `baseUrl` is accepted with or without the `/v1` suffix, because the dashboard shows the integration address with it.

**Proof-of-work.** With a publishable key, `forms.submit` always fetches and solves a challenge before submitting. When a form has proof-of-work off, the server ignores the proof. This avoids a schema request per submission, at the cost of one solve (well under a second in browsers and Bun). The solver implements ALTCHA v2's SHA derivation with WebCrypto only (no dependency, I18) and is tested against the server's `altcha-lib`. Secret keys skip it. The worker solver and size budget stay in P5.1.

**Errors.** Every failure is a `BackbricksError` (`code`, `status`, `fieldErrors`, `requestId`, `hint`). Responses that don't fit the contract become `unexpected_response`, and no response at all becomes `network_error`.

**Snippets.** [`snippets.ts`](../../apps/web/src/modules/forms/snippets.ts) is the only place snippet text is written. It produces plain HTML (no JavaScript; needs proof-of-work off and a success page, Q13), the SDK variant (form markup plus a script that reads each field by type, passes the honeypot and writes the result with `textContent`, I8) and a server-to-server `fetch` with a secret key read from `BACKBRICKS_SECRET_KEY`. A browser `fetch` snippet is left out because it can't pass proof-of-work without the SDK. [`examples/html`](../../examples/html) must contain exactly these snippets for its `form.json`; a test compares them, and the formatter skips the example's HTML so the comparison stays exact. A new architecture rule (`examples-only-mit`) keeps examples on the SDK and contract (I18).

**Product version.** The release version is the version of `@backbricks/server`, which is the image `ghcr.io/nolliebigspin/backbricks`. Changesets versions private packages without tags. The SDK and CLI get their own versions when they are published (M5). The tag-triggered workflow refuses a tag that doesn't match the server version.

## Consequences

- Publishable keys appear in URLs and so in access logs. They are public by design (shown in website code), so this exposes nothing new.
- A form with proof-of-work off still costs SDK users one solve. If that matters, P5.1 can read the public schema (cached for 60 s) first.
- Changing snippet text means regenerating `examples/html`; the comparison test fails until both match.
- Releases bump only `@backbricks/server`; its `CHANGELOG.md` is the product changelog.
