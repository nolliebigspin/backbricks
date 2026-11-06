# ADR-0009: S3-compatible object storage, Garage as the self-host default

- **Status:** accepted
- **Date:** 2026-11-04
- **Related:** ARCHITECTURE §0 #8, §A.5, §C.4, §H; AGENTS.md I9, I14, I19; PLAN P0.3a, P0.9b, P1.8

## Context

Uploads need durable object storage with presigned URLs. Self-hosters need a lightweight open-source option; the cloud uses an EU provider. MinIO's community edition went into maintenance mode in late 2025 and has since been archived.

## Decision

**Storage is accessed only through a `StorageAdapter` interface; the default implementation uses the AWS SDK v3 S3 client and presigner. The self-host and dev default is Garage.** Object storage is required only when an enabled module declares it (Uploads, ADR-0019).

## Consequences

- Any S3-compatible provider (Garage, Hetzner, Scaleway, IONOS) works by configuration.
- Behavior differences between S3 implementations (signed `Content-Length`, CORS, `CopyObject`) are covered by a storage contract suite (P3.10) and checked early in the P0 spike.
- Garage's image has no shell, so dev initialization (bucket, key, CORS) runs as a script from the app's dev image.
- `Bun.S3Client` may replace the AWS SDK behind the same interface once it passes the contract suite.

## Alternatives considered

- **MinIO:** archived community edition. Rejected.
- **SeaweedFS, RustFS:** viable, but heavier or less proven for this setup. Rejected for now.
- **Local filesystem storage:** no presigned URLs, no direct browser uploads. Rejected.
