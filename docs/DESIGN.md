# Design: "Running bond"

The visual language for every Backbricks surface: the website (`apps/www`) and the dashboard (`apps/web`). The tokens live in one place, [`packages/ui/src/styles.css`](../packages/ui/src/styles.css). This document explains the reasoning; the CSS is the source of truth for values. Decision record: [ADR-0075](adr/0075-running-bond-visual-identity.md).

## Who we design for

| Surface | Reader | Their job | What the design must do |
|---|---|---|---|
| Website | Developers and their AI agents | Decide in a minute whether Backbricks fits | Show *what exists* and *what is planned*, then the integration path |
| Dashboard | Site owners (often non-technical, often on a phone) | Read an inquiry, download a CV, approve a review | Stay calm, obvious and fast. Nothing to learn. |

## The idea

Backbricks is a set of bricks you lay into a website. In masonry, a **running bond** is the most common wall: each course (row) is offset by half a brick, so the joints never line up. That gives us:

- **The brick shape** (a 2 : 1 rectangle with a small radius) as the single recurring mark: in the logo, the active navigation marker and the website's module wall.
- **Mortar and brick** as the palette: a cool grey "mortar" ground, white surfaces, graphite ink and one fired-brick red.
- **Courses** as the layout rhythm: content sits in clear horizontal bands with a visible joint (hairline border) between them.

We spend the boldness in **one place per surface**: the module wall on the website, and the brick marker in the dashboard. Everything else stays quiet.

## Color

| Token | Role | Light | Dark |
|---|---|---|---|
| `--mortar` (`--muted`, `--sidebar`) | Page ground, sidebar, quiet bands | `#ECEEEB` | `#16191B` |
| `--background` / `--card` | Surfaces people read on | `#FFFFFF` | `#1F2427` |
| `--foreground` (graphite) | Text, primary buttons | `#1D2326` | `#E9ECEA` |
| `--muted-foreground` (slate) | Secondary text (≥ 4.5 : 1 on both grounds) | `#5A646A` | `#9AA4A9` |
| `--border` (joint) | Hairlines between courses | `#D8DCD9` | `#30373B` |
| `--brand` (brick) | Brand mark, active marker, links on the website, focus ring | `#B53A24` | `#E2674F` |
| `--success` (moss) | Ready, delivered, published | `#2A7146` | `#5DB585` |
| `--warning` (ochre) | Scanning, pending, needs attention | `#965D0E` | `#DDA44A` |
| `--destructive` | Delete, quarantined, failed | shadcn default | shadcn default |

Dark mode follows the operating system (`prefers-color-scheme`); there is no in-app toggle.

Rules:

- **Brick is a signal, not a fill.** It marks the brand, where you are and focus. Primary buttons are graphite, so a red button never competes with a destructive one.
- Status always pairs color with a word (`StatusBadge`), never color alone.
- No gradients, no glows, no tinted shadows. Elevation comes from a white surface on mortar plus a joint line.

## Type

| Role | Family | Use |
|---|---|---|
| Display (`font-heading`) | **Bricolage Grotesque** (variable, `opsz` + `wdth`) | Page titles, section headings, website hero, module names |
| UI and body (`font-sans`) | **Hanken Grotesk** (variable) | Everything else: navigation, tables, forms, paragraphs |
| Code (`font-mono`) | **Geist Mono** | Snippets, keys, IDs |

*Bricolage* is literally "building with what is at hand", which is what the product does. Its ink traps and slightly condensed large sizes carry the personality, so the body face stays neutral and legible at 14 px in dense tables. All fonts are self-hosted through Fontsource (the website's strict CSP forbids font CDNs).

Scale (dashboard, ratio ≈ 1.25): 12 · 14 (base UI) · 16 (reading) · 20 · 24 (page title) · 30. The website adds a fluid display size for the hero (`clamp(3rem, 7vw, 5.75rem)`). Headings use `text-balance`, paragraphs `text-pretty`, and body copy stays under ~70 characters per line.

Avoid: all-caps eyebrow labels, coloring one word of a headline, monospace for non-code labels.

## Layout

### Dashboard

A conventional, predictable app frame. Owners should recognize it without thinking.

```
┌──────────────────┬──────────────────────────────────────────────┐
│ ▰ Backbricks     │  Inbox                          [ Export ]    │  ← page header
│                  │  Messages people sent through your forms      │
│ Organization ▾   ├──────────────────────────────────────────────┤  ← joint
│ Project      ▾   │                                              │
│                  │  content on white, left-aligned,             │
│ ▰ Overview       │  max ~72rem                                   │
│   Inbox          │                                              │
│   Files          │                                              │
│   Embed          │                                              │
│   Settings       │                                              │
│ ──────────────   │                                              │
│   Projects       │                                              │
│   Members        │                                              │
│   Activity       │                                              │
│                  │                                              │
│ you@site.com     │                                              │
│ Language · Sign out                                             │
└──────────────────┴──────────────────────────────────────────────┘
   mortar sidebar        white work surface
```

- **Sidebar (≥ 1024 px):** mortar ground, organization and project pickers on top, project navigation, then organization navigation, account at the bottom. The current page is marked with a small brick (`▰`) in brand red plus bold text, never a filled pill.
- **Phone (< 1024 px):** a top bar with logo, current project and a "Menu" button that opens the same navigation as a panel. Inbox and moderation views must work one-handed (§E.5.7).
- **Page header:** title in display type, one sentence of description, actions on the right. One header per page.
- **Auth screens:** a single white panel on mortar, logo above, nothing else to distract.

### Website

```
┌───────────────────────────────────────────────────────────────┐
│ ▰ Backbricks         Bricks  How it works  Open source  FAQ  ⌥ │
├───────────────────────────────────────────────────────────────┤
│ Backend bricks                                                 │
│ for any website.                       (left-aligned, huge)    │
│ Forms, uploads, reviews…   [ Star on GitHub ] [ Roadmap ]      │
│                                                               │
│ ▬▬▬▬▬▬▬▬ ▬▬▬▬▬▬▬▬ ▬▬▬▬▬▬▬▬ ▭▭▭▭▭▭▭▭ ▭▭▭▭▭▭▭▭ ▭▭▭▭▭▭  ← the wall  │
│     ▭▭▭▭▭▭▭▭ ▭▭▭▭▭▭▭▭ ▭▭▭▭▭▭▭▭ ▭▭▭▭▭▭▭▭ ▭▭▭▭▭▭▭▭ ▭▭     (bleeds)  │
│ ▭▭▭▭▭▭▭▭ ▭▭▭▭▭▭▭▭ ▭▭▭▭▭▭▭▭ ▭▭▭▭▭▭▭▭ ▭▭▭▭▭▭▭▭ ▭▭▭▭▭▭             │
├───────────────────────────────────────────────────────────────┤
│ The bricks: one row per brick: name │ for your site │ for owner │
├───────────────────────────────────────────────────────────────┤
│ How it works: three real steps + the agent session            │
│ …                                                             │
└───────────────────────────────────────────────────────────────┘
```

- **The wall is the hero.** A full-bleed running bond: solid bricks are modules you can use today (with their version), outlined bricks are planned candidates. It replaces the badge list and tells the roadmap at a glance. It is the only decorative element on the page, and it is still content.
- Sections are left-aligned courses separated by joints, not floating cards. Numbered markers appear only where the content is a sequence ("How it works").
- One motion moment: the wall's courses settle in once on load (disabled under `prefers-reduced-motion`). No scroll-triggered fades.

## Components

Shared building blocks live in `packages/ui` (AGENTS.md §2.2). Introduced or reshaped by this concept:

| Component | Purpose |
|---|---|
| `LogoMark` | The three-brick mark, `currentColor`. Used by both apps. |
| `BrickMarker` | The small brick that marks the current navigation item. |
| `PageHeader` | Title, description and actions for every dashboard page. |
| `StatusBadge` | Tone → `Badge` variant (`success`, `secondary`, `warning`, `destructive`), always with a dot and a label. |

Use shadcn primitives as they are; change the look through tokens, not per-screen class overrides (`@shadcn/lint` `no-restyle`).

## Quality floor

- Contrast ≥ 4.5 : 1 for text, ≥ 3 : 1 for UI boundaries, in light and dark.
- Visible focus ring (brick, 2 px offset) on everything interactive.
- Every layout works at 360 px wide without horizontal scrolling.
- `prefers-reduced-motion` disables the wall animation.
- Copy stays in i18n keys (en, de), sentence case, plain verbs (§E.5).
