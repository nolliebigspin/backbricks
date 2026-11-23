# Storage compatibility checks

The required [storage contract](../packages/adapters/test/storage-contract.ts) runs against Garage in `bun run check`/CI. [The Chromium journey](../e2e/storage.spec.ts) performs a real cross-origin PUT with a `File`: the browser computes `Content-Length` and enforces CORS. A late replacement PUT cannot change the private copy. These tests use the same compose/initialization settings as development.

```sh
mise run infra
CI=true bun test packages/adapters/src/storage/s3.test.ts packages/adapters/src/storage/s3-sessions.test.ts
bun run test:e2e -- storage.spec.ts --retries 0
```

To check another S3-compatible backend, provide an explicitly selected test bucket/key with HEAD, PUT, GET, COPY and DELETE permission plus multipart initiation, part upload, listing, completion and abort. Configure its CORS to allow PUT/GET/HEAD from `TEST_S3_CORS_ORIGIN` (default `http://localhost:5173`) and allow `Content-Type`. Never use a key that cannot be safely used for test writes. Only newly generated `test/<uuid>/…` fixture keys and their multipart sessions are created/deleted; the suite does not enumerate, clear or reconfigure the bucket.

```sh
TEST_S3_ENDPOINT=https://your-storage.example \
TEST_S3_BUCKET=your-test-bucket \
TEST_S3_ACCESS_KEY_ID=your-test-access-key \
TEST_S3_SECRET_ACCESS_KEY=your-test-secret \
TEST_S3_REGION=your-region \
CI=true bun test packages/adapters/src/storage/s3.test.ts packages/adapters/src/storage/s3-sessions.test.ts
```

Optional settings: `TEST_S3_PUBLIC_ENDPOINT`, `TEST_S3_FORCE_PATH_STYLE=true|false` (default true), and `TEST_S3_CORS_ORIGIN`. Partial opt-in fails with field names only; credentials are never printed. The suite reports optional-provider evidence only when these settings are supplied. No external provider was exercised by the initial Garage acceptance run.

The assertions cover exact signed length/type, rejected smaller/larger/mismatched PUTs leaving no object, CORS preflight, HEAD, private COPY/read/delete, expired signatures and forced attachment/explicit safe-image response overrides. Content inspection and authorization of preview requests remain the uploads module's responsibility; the low-level storage adapter never establishes that arbitrary bytes are a safe image.

The [upload-session contract](../packages/adapters/test/storage-session-contract.ts) additionally proves server-only completion, rejection of mismatched part declarations, consumed-session replay rejection and abort of a PUT body that spans signature expiry. Run both adapter suites for provider acceptance: raw presigned PUT behavior alone cannot establish the uploads safety contract (see [ADR-0072](adr/0072-server-finalized-upload-sessions.md)). The same `TEST_S3_*` opt-in applies to both suites; external-provider evidence is recorded only when actually exercised.

## Development storage

The server uses `S3_ENDPOINT`. Browsers use `S3_PUBLIC_ENDPOINT`, which must be reachable from the website. Register the site's origin both on the Backbricks project and in bucket CORS. Outside local development use HTTPS. A container's `localhost` belongs to that container.

The dev initializer includes dashboard and server origins. To add a local integration on port 8080:

```sh
S3_CORS_ORIGINS=http://localhost:5173,http://localhost:3000,http://localhost:8080 bun scripts/dev/garage-init.ts
```

Allow PUT/GET/HEAD, signed request headers and exposed `ETag` on the bucket. Keep object access private. Use the contract suites above to verify the provider supports the permissions, signed requests and server-finalized upload sessions.

## Operations

Back up Postgres and private storage before an upgrade. Stop old workers and run the new image's `migrate` role before starting the app and worker. Keep the owning modules and original storage backend available while cleanup settles. File deletion revokes access immediately. Durable jobs abort upload sessions and remove objects, and upload deadlines may defer physical settlement. The project and subject erasure workflows account for that lifecycle. [Upload implementation](modules/uploads.md) · [ADR-0064](adr/0064-upload-ownership-and-durable-erasure.md)
