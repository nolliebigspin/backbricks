# ADR-0082 · Production bootstrap and storage proxy

Status: implemented for P6.1–P6.3, pending maintainer review.

The first-owner bootstrap runs as an operator-only image role after migrations. It accepts bounded, validated stdin and serializes setup with a PostgreSQL transaction lock. Owner creation and the instance setup marker commit together. The role refuses a database with an existing user or completed setup and requires self-hosted, invite-only configuration. The existing dashboard sign-in and organization workflows continue after bootstrap.

The proxy wraps only signed provider requests already issued by the existing storage adapter. The app exposes opaque, authenticated and expiring transfer tickets. A write ticket fixes the target, method, exact byte length and content type. The application streams one bounded part to the configured private provider. The existing completion, immutable copy and scan path remains responsible for lifecycle and safety. The proxy also wraps audited presigned downloads so private Garage stays off the public network.

Single-host backup takes a quiesced PostgreSQL dump and copies both stopped Garage volumes into an encrypted restic snapshot. Recovery targets a fresh deployment. Configuration and recovery credentials are stored separately.
