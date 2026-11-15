# @backbricks/server

## 0.1.0

### Minor Changes

- [#10](https://github.com/nolliebigspin/backbricks/pull/10) [`c880eb6`](https://github.com/nolliebigspin/backbricks/commit/c880eb62ad7936b95773b91f8c02af1a3e250778) Thanks [@nolliebigspin](https://github.com/nolliebigspin)! - First developer preview (milestone M2): the platform core plus the **Forms** module.

  - **Forms for any website:** a headless form API with server-side validation and structured field errors, plain HTML posts without JavaScript (success and error pages), proof-of-work spam protection without third-party captchas, a honeypot, a spam folder, idempotent retries and per-form limits.
  - **Inbox for site owners:** forms from templates, a fields editor that warns before changes affect existing entries, entries with search, filters, status, bulk actions and CSV export (formula-safe), notification emails without entry content by default, retention and automatic purging.
  - **Integration:** copy-ready HTML, SDK and server snippets in the dashboard; a minimal TypeScript SDK (`createClient`, `forms.submit`, not yet on npm); the HTML example in `examples/html`.
  - **Privacy:** export and erasure of one person's data, hard erasure of archived projects, hashed IPs and audit entries for every administrative change.
  - **Self-hosting:** one image for every role, `BACKBRICKS_MODULES=forms` runs with just the app and Postgres.
