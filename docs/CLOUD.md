# Managed cloud

Topics that only matter for the managed EU cloud (milestones C1–C3 in `docs/MILESTONES.md`, after the open-source 1.0). The cloud runs the same code as self-hosting; the differences are listed in `docs/ARCHITECTURE.md` §G.5 and wired via `DEPLOYMENT_MODE` and dependency injection (ADR-0017). Nothing here may add `if (cloud)` branches to modules (I15).

## 1. Row-level security (C1.4)

Postgres RLS is the second line of defense behind `withTenant` (ARCHITECTURE §B.6, ADR-0011). `withTenant` already sets `app.org_id` / `app.project_id` per transaction, so enabling RLS needs no data migration:

```sql
ALTER TABLE form_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON form_submissions
  USING (organization_id = current_setting('app.org_id', true)
         AND (current_setting('app.project_id', true) IS NULL
              OR current_setting('app.project_id', true) = ''
              OR project_id = current_setting('app.project_id', true)));
```

The app role has no `BYPASSRLS`; cross-tenant jobs (retention) use a dedicated role. Same policy on every tenant table, with tests.

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

Verify before deciding; prices and availability change.

| Provider | HQ | Compute in DE | Managed Postgres | Object storage | Assessment |
|---|---|---|---|---|---|
| **Hetzner** | DE | ✔ (Nuremberg, Falkenstein) | ✘ | ✔ (Nuremberg, Falkenstein, Helsinki) | Cheapest start; run the DB yourself. Price increases and object storage load issues in 2026 |
| **IONOS Cloud** | DE | ✔ | ✔ | ✔ | Full managed stack in DE, pricier, weaker DX |
| **STACKIT** | DE | ✔ | ✔ | ✔ | Sovereign, enterprise-oriented |
| **Scaleway** | FR | ✘ (FR/NL/PL) | ✔ | ✔ | Best EU DX and managed services, but no DE region |
| **OVHcloud** | FR | ✔ | ✔ | ✔ | Broad offering, mixed DX |

**Recommendation for the start:** Hetzner Cloud (DE). VM 1 runs app + worker + ClamAV, VM 2 runs Postgres (dedicated vCPU, local NVMe), with pgBackRest/WAL-G backups to object storage at **another provider or location**. If running the DB yourself becomes too much, switch to managed Postgres at IONOS or STACKIT (DE). Files go to Hetzner Object Storage (DE); because storage is abstracted, switching providers is configuration plus a data copy. Use an EU-based SMTP provider with a DPA, self-hosted GlitchTip or Sentry's EU region for error tracking, and uptime checks plus logs (self-hosted Grafana/Loki or an EU provider) for monitoring.

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
