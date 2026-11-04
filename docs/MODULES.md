# Module catalog

Corbel aims to be **one headless backend and one dashboard for every interactive feature a website needs**, instead of a separate tool, account and admin UI per feature. Version 1 ships three modules. The rest of this catalog shows the direction: candidates, not commitments. After `v1.0.0` they are prioritized by demand.

Every module follows the module contract (`docs/ARCHITECTURE.md` §C). If a module needs something the platform doesn't have yet, that **platform capability** is designed once in the core (with an ADR) and shared by every module that needs it. Modules don't each build their own version.

## Available in v1

| Module | Website element | Backend function | Comparable standalone tool |
|---|---|---|---|
| **Forms** | Contact, quote, application, sign-up forms | Submissions, validation, spam protection, inbox, export, notifications | Formspree, Basin |
| **Uploads** | File upload areas | Direct-to-storage uploads, malware scan, private downloads | UploadThing |
| **Reviews** | Testimonials, review sections | Reviews, moderation, publishing, stats | ReviewsKits |

## Candidate modules (after v1)

| Module | Website element | Backend function | Comparable standalone tool | Builds on |
|---|---|---|---|---|
| **Waitlist & newsletter sign-up** | Sign-up field | Entries, double opt-in, export | – | Forms patterns, mailer |
| **Event registration** | Registration form | Registrations, capacity limits, waiting list, reminders | – | Forms |
| **Surveys** | Multi-step survey | Responses, branching, statistics | Formbricks | Extends **Forms** (not a separate submission store) |
| **Polls** | Poll / vote block | Votes, results, duplicate-vote protection | Rallly | Visitor sessions |
| **Feature voting** | Idea board, public roadmap | Ideas, upvotes, statuses, roadmap | Fider | Visitor sessions, moderation from Reviews |
| **Comments** | Comment threads | Threads, moderation, publishing | – | Visitor sessions, moderation from Reviews |
| **Live chat** | Chat widget (own UI) | Conversations, team inbox, assignment, canned replies | Chatwoot | Realtime, visitor sessions |
| **Appointment booking** | Booking flow | Availability rules, bookings, reminders, calendar sync | Cal.com | Scheduling |
| **Analytics** | Tracking call via SDK | Page views, events, conversions, cookieless | Umami | Event ingest |
| **Cookie consent** | Consent banner (own UI) | Consent configuration, preferences, consent records as proof | CookieConsent | Cached public config |
| **Job postings** | Careers page | Job listings, applications | Payload (self-configured) | Content collections + Forms + Uploads |
| **Gallery** | Image galleries | Images, albums, sharing | Payload (self-configured) | Content collections, image variants, Uploads |
| **Product catalog** | Product pages | Products, variants, orders | Payload Ecommerce | Content collections, payments |
| **Protected content** | Members area, gated downloads | Access rules, protected files | Payload (self-configured) | Visitor identity, Uploads |

## Platform capabilities these modules need

| Capability | What it is | Unlocks | Architecture notes |
|---|---|---|---|
| **Visitor sessions** | Anonymous, project-scoped visitor token (signed, cookieless by default) | Polls, feature voting, comments, live chat | Not user accounts. Combined with PoW and hashed IPs for duplicate protection; needs a privacy review |
| **Realtime** | Push channel to browsers and the dashboard (SSE/WebSocket) | Live chat, live poll results, dashboard live updates | Bun native WebSockets + Postgres `LISTEN/NOTIFY` on one node; a broker only once there are several nodes (ADR) |
| **Content collections** | Owner-managed, typed content with a public, cacheable read API | Job postings, gallery, product catalog | Typed per module, **not** a generic CMS; reuses the public read pattern from Reviews (ETag, allowlisted fields) |
| **Scheduling** | Availability rules, time zones, iCal/CalDAV sync | Appointment booking, event reminders | Calendar providers behind an adapter interface |
| **Event ingest** | High-volume append-only events with rollups | Analytics | Partitioned Postgres tables + rollup jobs first; a dedicated store only with measured need (ADR, would change key decision 6) |
| **Visitor identity** | Login for website visitors (magic link, access codes) | Protected content, customer portals | Explicitly out of v1. Strictly separate from dashboard auth (own tables, keys, cookies) |
| **Payments** | Checkout through a payment provider | Product orders, paid bookings | Out of v1; provider adapter like the cloud billing interface |
| **Image variants** | Thumbnails, resizing, format conversion | Gallery, product catalog, upload previews | Extends Uploads (worker job) |

## Rules for new modules

1. **Reuse before adding.** Surveys extend Forms; job applications are Forms + Uploads; comments reuse the review moderation flow. A new module must not duplicate an existing module's storage or workflow (see `CLAUDE.md` §2).
2. **Capabilities are built once.** If a module needs a missing capability, propose it in an ADR, implement it in the core, and design it so the other modules in the "Unlocks" column can use it too.
3. **Same guarantees as v1.** Tenant isolation, abuse protection on public endpoints, retention and GDPR export/erasure handlers, audit logging, config-as-code, CLI/MCP support.
4. **Start with the plan.** In Claude Code: `/new-module <name> "<purpose>"` produces a plan in `docs/modules/<name>.md` for review before any code is written.

## Suggested order (to be validated with users)

- **Low effort, mostly existing capabilities:** waitlist & newsletter, event registration, surveys, cookie consent
- **Needs visitor sessions:** polls, feature voting, comments
- **Needs a larger capability:** live chat (realtime), appointment booking (scheduling), analytics (event ingest), job postings and gallery (content collections)
- **Needs capabilities that are out of v1 on purpose:** protected content (visitor identity), product catalog (payments)
