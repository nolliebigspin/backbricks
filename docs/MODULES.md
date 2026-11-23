# Module catalog

Version 1 includes [Forms](modules/forms.md), [Uploads](modules/uploads.md) and [Reviews](modules/reviews.md). Each reference links to implementation, tests and its approved plan. See [module architecture](ARCHITECTURE.md#c-module-architecture) for shared contracts and registry behavior.

## Candidates after v1

These are candidates to prioritize by user demand after 1.0.

| Candidate | Reuse or capability |
| --- | --- |
| Waitlists, newsletter signup and event registration | Forms, mail and double opt-in |
| Multi-step surveys | Forms with branching and response statistics |
| Cookie consent | Versioned consent records and cached public config |
| Polls, feature voting and comments | Anonymous, project-scoped visitor sessions and shared moderation patterns |
| Live chat | Visitor sessions and realtime delivery |
| Appointment booking | Scheduling and calendar adapters |
| Analytics | Event ingest and rollups |
| Job posts, galleries and product catalogs | Typed content collections with allowlisted reads. Reuse Forms and Uploads for applications and media, add image variants or payments where needed. |
| Protected content | Visitor identity separate from dashboard accounts and private Uploads |

## Rules for new modules

1. Start with an approved `docs/modules/<name>.md` covering config, data and migrations, routes and policies, jobs, privacy and retention, metrics, dashboard, SDK/CLI/MCP and tests.
2. Reuse existing storage, workflows and shared helpers. Propose new shared capabilities or changes to core or other modules through an ADR.
3. Exercise tenant isolation, public abuse protection, retention, privacy and transactional audit. Validate both standalone and optional-capability deployments.
4. Register the module in the server and dashboard. Integrate with the existing config/revision/codegen flow and document the supported client paths. [Example module shape](ARCHITECTURE.md#c5-example-a-hypothetical-fourth-module-waitlist)
