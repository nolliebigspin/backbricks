# ADR-0075: "Running bond" visual identity and dashboard frame

- **Status:** proposed
- **Date:** 2026-11-16
- **Related:** [DESIGN.md](../DESIGN.md), ARCHITECTURE §E (dashboard), §E.3 (shared UI), ADR-0001 (shared `packages/ui` theme), ADR-0006 (dashboard SPA)

## Context

Both UIs used the stock shadcn neutral theme with Geist and a brick accent. The website followed a common SaaS template (badge, one colored headline word, uppercase eyebrows, three icon cards), and the dashboard had no navigation frame: a centered column with selects and text links. Site owners, who often read inquiries on a phone (§E.5.7), had no stable place to find Inbox, Files or Settings.

## Decision

Adopt one visual language, **"Running bond"**, for every Backbricks surface, documented in [DESIGN.md](../DESIGN.md) with values only in `packages/ui/src/styles.css`.

- **Palette:** cool mortar ground, white surfaces, graphite ink, one fired-brick red used as a signal (brand, current page, focus), plus moss/ochre status tones. Dark mode follows `prefers-color-scheme`; there is no in-app toggle.
- **Type:** Bricolage Grotesque for headings, Hanken Grotesk for UI and body, Geist Mono for code, all self-hosted via Fontsource (strict CSP).
- **Dashboard frame:** a fixed sidebar (organization and project pickers, project pages, organization pages, account) on ≥ 1024 px, and a top bar with a "Menu" button below that, rendering the *same* navigation once so links and labels never duplicate. Every page starts with the shared `PageHeader`. The current page is marked with the brick (`BrickMarker`) plus `aria-current`.
- **Website:** the hero is a running-bond wall of modules by status (available, before 1.0, candidates), replacing the badge list; sections are divider-separated rows instead of card grids.
- **Shared components:** `Logo`/`LogoMark`, `BrickMarker` and `PageHeader` live in `packages/ui`; `Badge` gains `success`/`warning` variants used by `StatusBadge`.

## Consequences

- One place to change the look; screens consume shadcn token names only.
- Dark mode is now active for users whose system prefers it. New screens must be checked in both schemes.
- `apps/web` depends on `lucide-react` directly (same pinned version as `packages/ui`) for the menu icon.
- The website's `og.png` still shows the previous style and should be regenerated.
- Pages not yet converted to `PageHeader` (form and upload-area detail pages with tabs) keep their own headings until they are next touched.

## Alternatives considered

- **Keep the neutral shadcn theme:** lowest effort, but indistinguishable from other products and gave the dashboard no structure.
- **Terracotta on cream with a serif display:** the most common generated "warm" look; rejected as generic, and it weakens the brick red as a signal.
- **shadcn `Sidebar` component:** heavier than needed (collapsible rails, cookies for state) for two navigation groups; a small sidebar built from existing primitives covers the need.
