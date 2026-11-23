# Backbricks design

Use the **running bond** identity on the website and dashboard. The brick shape marks the logo, active navigation and the website's module wall. Mortar backgrounds and thin joints frame readable surfaces. Read token values from [shared CSS](../packages/ui/src/styles.css) and rationale in [ADR-0075](adr/0075-running-bond-visual-identity.md).

## Website

Show which modules exist and how to integrate them. The running-bond wall uses solid bricks for available modules and outlined bricks for candidates. Organize the page in left-aligned sections with joint lines. Animate the wall once on load and respect reduced motion. [Website source](../apps/www)

## Dashboard

Make common tasks easy to find on a phone. Use the shared shell with organization and project pickers, project and organization navigation, and account actions. On small screens expose the same navigation in a menu. Use one page header with the title and relevant actions. Give authentication a single focused panel. [Dashboard shell](../apps/web/src/dashboard/shell.tsx)

## Shared UI

- Use existing tokens and shadcn primitives from [packages/ui](../packages/ui). Keep brand red for the mark, current location, links and focus. Use graphite for primary actions and reserve destructive styling for destructive actions.
- Use `font-heading` for headings, `font-sans` for UI and body, and `font-mono` for code, keys and IDs. The site self-hosts fonts through Fontsource.
- Reuse the shared logo, brick marker, page header and status presentation. Pair state color with text. Write UI copy in the English and German locale files.
- Check both color schemes, visible keyboard focus, reduced motion and 360 px layouts. Aim for at least 4.5:1 text contrast and 3:1 control-boundary contrast.

[Dashboard architecture and UX](ARCHITECTURE.md#e-dashboard)
