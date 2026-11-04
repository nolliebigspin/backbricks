# ADR-0001: Marketing site as one Astro app on Vercel

- **Status:** accepted
- **Date:** 2026-11-04
- **Related:** ARCHITECTURE §B (why not Next.js), §D.11 (docs), §E.3/§E.6 (UI), §G.1 (repo layout), §H (stack); PLANNING_PROMPT P5.7

## Context

The domain `backbricks.app` should get a marketing page before milestone M0 starts. The same domain must later serve URLs the product already uses: problem types (`/errors/<code>`), the config schema (`/schema/config.v1.json`), the docs (`/docs`, `/docs/api`) and `llms.txt`. The architecture planned a separate Astro Starlight app `apps/docs` from M5, and `packages/ui` from M0.

The site should use React so components can be shared with the dashboard. Hosting is on Vercel, where the maintainer has a Pro account.

## Decision

**One Astro app, `apps/www`, serves the whole `backbricks.app` domain.** It's a static site with React islands and Tailwind v4, deployed to Vercel. The docs (Starlight at `/docs`), the error pages and the schema join this app in M5. There will be no separate `apps/docs`.

Details:

- **Shared UI:** `packages/ui` (shadcn, `radix-nova` preset) is created now, ahead of M0. It holds the theme (`styles.css`), the shadcn components and shared domain components such as `SnippetTabs`. The dashboard will import the same package and theme.
- **Markup in `.tsx`, not `.astro`.** Sections are React components rendered to static HTML; only interactive parts hydrate (`client:visible`). `.astro` files only compose pages and layouts. Reasons: `@astrojs/check` supports TypeScript 5/6 only (we use 7), oxfmt skips `.astro` files, and oxlint reads only their frontmatter. In `.tsx` files, `tsc`, oxlint and `@shadcn/lint` check everything.
- **Strict CSP without `'unsafe-inline'`.** Astro's `security.csp` hashes its own inline scripts and styles into a per-page `<meta>`. Code samples use Prism (class-based highlighting) because Shiki emits inline styles. A few style attributes Radix renders on the server are allowed by hash (`'unsafe-hashes'`). Directives a `<meta>` can't carry (`frame-ancestors`), HSTS and the other security headers are set in `apps/www/vercel.json`.
- **Vercel setup lives in the repo** (`apps/www/vercel.json`): the install step pins Bun 1.4.4 (Vercel only guarantees "Bun ≥ 1.2" for `bun.lock`), the build runs through Turborepo, and `turbo-ignore` skips deploys when `apps/www` and its dependencies didn't change.
- **Design-system linting:** `@shadcn/lint` runs as an oxlint JS plugin for all app code. The vendored components in `packages/ui/src/components` are exempt from `no-restyle` and `no-arbitrary-values` because they define the design system.

## Consequences

- One domain, one Vercel project, one layout and theme for marketing and docs. Docs pages can link and share components without crossing apps.
- Vercel hosts only the public website. It's not part of the self-hosted product, so I14 (no proprietary cloud service in the core) is unaffected. Self-hosters never need Vercel.
- `.astro` files are not typechecked or formatted. Keep them thin.
- The Radix style hashes in `astro.config.ts` can go stale after a Radix update. The symptom is a CSP warning in the browser console (with the new hash) and a missing accordion animation, not broken content.
- Follow-ups:
  - M0: the dashboard imports `@backbricks/ui/styles.css`. dependency-cruiser gets a rule that `apps/www` may import only `packages/ui` (later also `packages/api-contract` types), never server code.
  - M5: add Starlight at `/docs`, plus `/errors/*`, `/schema/*` and the full `llms.txt` to `apps/www`.
  - Before launch: imprint details and a reviewed privacy policy.

## Alternatives considered

- **Separate `apps/docs` (as planned) and `apps/www`.** That means two Vercel projects, a subdomain or rewrites for `/docs`, and duplicated layout. Rejected: no benefit for a single maintainer.
- **Next.js on Vercel.** Strong Vercel integration, but a server framework for a static page, and the architecture already chose Astro for docs. Rejected.
- **Plain Vite SPA like the dashboard.** Poor SEO and no static HTML without extra tooling. Rejected.
- **Shiki highlighting with `'unsafe-inline'` styles.** Prettier defaults, weaker CSP. Rejected in favor of Prism plus theme-colored tokens.
