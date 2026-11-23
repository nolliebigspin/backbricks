# Managed cloud

Topics that only matter for the managed EU cloud (milestones C1–C3 in `docs/MILESTONES.md`, after the open-source 1.0). The cloud runs the same code as self-hosting; the differences are listed in `docs/ARCHITECTURE.md` §G.5 and wired via `DEPLOYMENT_MODE` and dependency injection (ADR-0017). Nothing here may add `if (cloud)` branches to modules (I15).

## 1. Row-level security (C1.4)

Postgres RLS adds a second layer behind the [tenant repositories](ARCHITECTURE.md#b6-tenant-isolation-in-the-data-layer). Build policies around the transaction-local organization and project settings. Test the app role without bypass privileges, pooled connections and separate authorization for global maintenance.

## 2. Usage metering and billing (C1.2, C1.3, C2.1)

- **Metrics:** `forms.submissions`, `reviews.submissions`, `uploads.files`, `uploads.bytes_ingested`, `uploads.bytes_stored` (gauge, daily), `downloads.bytes` (approximated from issued download URLs × size), `api.public_requests`, number of projects and members
- **Capture:** `usage.increment()` inside the write transaction (UPSERT on `usage_counters`); a daily job computes gauges
- **Enforcement:** `entitlements.check(org, metric, delta)` before writes. At 80 % an email goes out; at 100 % there is a 10 % grace margin, then `402 quota_exceeded`. The dashboard is never locked; data stays readable
- **Billing:** `cloud/billing` implements a `BillingProvider` interface (checkout, portal, webhooks → org plan); provider chosen in C2 (Stripe Billing vs. Paddle as merchant of record)

## 3. Backup and restore (C1.5, C2.3)

- **Postgres:** continuous WAL archiving + daily base backups with **pgBackRest or WAL-G** to object storage at a **different location**, PITR for 14–30 days, plus a weekly logical `pg_dump`
- **Object storage:** versioning/replication to a second location or nightly `rclone sync`
- **Restore drills:** quarterly manual restore with a written record (the first one is a C2 exit criterion)

## 4. Hosting (C1.5)

Select EU compute, Postgres, object storage and SMTP during C1. Compare current regional availability, total cost, recovery targets, data processing terms and operator effort. Keep backups at a separate provider or location and test recovery before onboarding. Provider choice stays behind the existing interfaces.

## 5. Technically buildable vs. legally to be reviewed (C2.4, C3.1)

| Topic | Technical (we build) | Legal (lawyer/DPO reviews) |
|---|---|---|
| Processing on behalf | Tenant isolation, deletion features, audit | DPA template (Art. 28 GDPR) for cloud customers |
| TOMs | Encryption, access control, backups, logging | TOM documentation as DPA annex |
| Sub-processors | Swappable providers, EU locations | Public list, change notifications |
| Third-country transfer | No US services in the data path | Review of all providers (incl. email, error tracking, billing) |
| Data breaches | Audit logs, alerting, runbook | 72 h notification process (Art. 33), customer information |
| Data subject rights | Export/erasure by email | Process between customer (controller) and us |
| Reviews | Moderation, publish status, "verification method" field | Transparency duties about review authenticity (§ 5b UWG in Germany), shown as hints in the dashboard |
| Consent | Consent field with version | Wording is the site operator's responsibility |
| Backups containing deleted data | 30-day rotation | Disclosure in privacy policy/DPA |
| License | License files, SPDX headers, DCO check | License setup, trademark registration |
| Records of processing, imprint, terms, privacy policy | – | Have them drafted |

## 6. Remote MCP (C3.2, optional)

Remote MCP at `/mcp` (Streamable HTTP) with OAuth 2.1 via the Better Auth OAuth provider plugin, so users can connect agents without copying keys. Same tools and scopes as the stdio server (ARCHITECTURE §D.9).
