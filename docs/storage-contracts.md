# Storage compatibility checks

The required [storage contract](../packages/adapters/test/storage-contract.ts) runs against Garage in `bun run check`/CI. [The Chromium journey](../e2e/storage.spec.ts) performs a real cross-origin PUT with a `File`: the browser computes `Content-Length` and enforces CORS. A late replacement PUT cannot change the private copy. These tests use the same compose/initialization settings as development.

```sh
mise run infra
CI=true bun test packages/adapters/src/storage/s3.test.ts
bun run test:e2e -- storage.spec.ts --retries 0
```

To check another S3-compatible backend, provide an explicitly selected test bucket/key with HEAD, PUT, GET, COPY and DELETE permission. Configure its CORS to allow PUT/GET/HEAD from `TEST_S3_CORS_ORIGIN` (default `http://localhost:5173`) and allow `Content-Type`. Never use a key that cannot be safely used for test writes. Only two newly generated `test/<uuid>/…` fixture keys are created/deleted; the suite does not enumerate, clear or reconfigure the bucket.

```sh
TEST_S3_ENDPOINT=https://your-storage.example \
TEST_S3_BUCKET=your-test-bucket \
TEST_S3_ACCESS_KEY_ID=your-test-access-key \
TEST_S3_SECRET_ACCESS_KEY=your-test-secret \
TEST_S3_REGION=your-region \
CI=true bun test packages/adapters/src/storage/s3.test.ts
```

Optional settings: `TEST_S3_PUBLIC_ENDPOINT`, `TEST_S3_FORCE_PATH_STYLE=true|false` (default true), and `TEST_S3_CORS_ORIGIN`. Partial opt-in fails with field names only; credentials are never printed. The suite reports optional-provider evidence only when these settings are supplied. No external provider was exercised by the initial Garage acceptance run.

The assertions cover exact signed length/type, rejected smaller/larger/mismatched PUTs leaving no object, CORS preflight, HEAD, private COPY/read/delete, expired signatures and forced attachment/explicit safe-image response overrides. Content inspection and authorization of preview requests remain the uploads module's responsibility; the low-level storage adapter never establishes that arbitrary bytes are a safe image.
