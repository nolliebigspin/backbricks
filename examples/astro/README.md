# Backbricks and Astro

From this directory link a project with `backbricks init --framework astro`. Copy the desired module sections from the [Scenario A configuration](../html/backbricks.config.example.json), retaining the linked project ID, then run `backbricks validate`, `backbricks diff`, `backbricks push --yes` and `backbricks codegen`.

Run `bun run dev` with the site's origin permitted in Backbricks and your storage CORS allowlist. The browser form uploads a PDF to the private CV zone before submitting a contact entry. A separate form sends a review for moderation, and published reviews appear on reload.
