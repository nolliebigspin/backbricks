# ADR-0006: Dashboard as a Vite SPA served by the API process

- **Status:** accepted
- **Date:** 2026-11-04
- **Related:** ARCHITECTURE §0 #5, §E, §H; ADR-0001; AGENTS.md I8; PLAN P0.7

## Context

The dashboard sits behind a login, so it has no SEO or SSR needs. Non-technical site owners use it, often on a phone. It should use the same API as agents (dogfooding) and share its UI with the marketing site.

## Decision

**A React 19 single-page app built with Vite, using TanStack Router and Query, shadcn/ui from `packages/ui` and Tailwind v4, with i18next (en, de).** The production build is served as static files by the `serve` process, same-origin with the API.

## Consequences

- One process serves API and dashboard; session cookies stay same-origin, and management routes need no CORS.
- The dashboard calls the management API like any other client; later it uses the generated client (`@backbricks/sdk/admin`).
- `packages/ui` is shared with `apps/www` (ADR-0001), so theme and components exist once.
- All copy goes through i18n keys from day one.
- No `dangerouslySetInnerHTML` (lint rule); a strict CSP is possible because nothing is rendered on the server.

## Alternatives considered

- **Next.js:** SSR and a server runtime the dashboard doesn't need, plus a second process. Rejected.
- **Separate static hosting for the dashboard:** cross-origin cookies and CORS on management routes. Rejected.
