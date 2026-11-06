# ADR-0044: Private S3 storage

- **Status:** accepted
- **Date:** 2026-11-06
- **Task:** P1.8e; ADR-0009/0013/0020

## Decision

The [S3 adapter](../../packages/adapters/src/storage/s3.ts) implements the existing storage port using the paired AWS client/presigner version 3.1163.0. The [official presigner documentation](https://github.com/aws/aws-sdk-js-v3/blob/main/packages/s3-request-presigner/README.md) and installed types define signing options; real Garage tests verify the adopted patch. Both clients retain `WHEN_REQUIRED` request/response checksum behavior from ADR-0020. PUT signatures bind content length and type explicitly. No operation sets a public ACL.

Validated config adds optional `S3_PUBLIC_ENDPOINT`, defaulting to `S3_ENDPOINT`. The adapter uses an internal client for HEAD/COPY/DELETE/stream/readiness and a distinct client for browser-facing signing. Signed URLs are never rewritten after signing. Endpoints reject credentials, query and fragment components. Compose supplies the browser endpoint with the configured Garage host port; it remains overridable for a proxy/domain. Storage-free installations neither validate irrelevant S3 settings nor construct/probe the adapter.

[Storage boundary schemas](../../packages/core/src/storage/schemas.ts) own limits, opaque key segments, allowed inline image types and signed-input validation. Original filenames are excluded from object keys and allowed only in safely encoded download disposition. PUT TTL is bounded to 15 minutes; GET to five minutes. Downloads default to attachment and octet-stream, independent of a user-supplied upload content type. Inline callers must supply a detected PNG/JPEG/WebP/GIF type; SVG/HTML are rejected. Actual file detection and copy-then-scan orchestration remain P3. The adapter's COPY test proves subsequent writes through an old staging URL cannot modify the copied object.

Readiness probes the bucket only when selected infrastructure requires storage, and the shared runtime closes both clients on shutdown. Provider failures return safe application errors without credential/request details. Raw IPs, object bodies and presigned URLs are never logged. Storage metadata/request types derive from core schemas; modules still depend only on the storage port.

## Evidence

`bun test packages/adapters/src/storage/s3.test.ts apps/server/src/storage-readiness.test.ts packages/core/src/config/load.test.ts` exercises Garage signed length/type rejection, private anonymous denial, attachment/inline policy, expiry, HEAD/COPY/DELETE/stream, copy immutability, endpoint split and storage-free boot. Garage rejects expired signatures with 400/date-too-old in this version; AWS-compatible 403 expiry is also allowed by the contract test. CI shares a live-service gate and cannot silently skip missing Garage. `docker compose config --quiet` validates nested public-port configuration.
