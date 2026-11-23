# Backbricks and Next.js

From this directory, link a project with `backbricks init --framework nextjs`. Copy the desired module sections from the [Scenario A configuration](../html/backbricks.config.example.json) into the linked config. Run `backbricks validate`, `backbricks diff`, `backbricks push --yes` and `backbricks codegen`.

Run `bun run dev` with the site origin in Project Embed and your storage CORS allowlist. The browser client submits a contact form with a PDF and sends a review for moderation. Published reviews appear on reload.

The server-action variant needs a separate form `contact-server` with required email and message fields. Configure `BACKBRICKS_BASE_URL` and `BACKBRICKS_SECRET_KEY` on the server only. Use a separate key with the `forms:submit` scope.
