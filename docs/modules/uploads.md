# Uploads

Uploads stores private files in configured areas. A browser uploads one signed part and the server validates and finalizes the session. A worker copies the object before inspecting or scanning it. The ready file reference can be claimed once by an owning record.

| Area | Source |
| --- | --- |
| Area settings and infrastructure | [Module definition](../../packages/modules/uploads/src/module.ts) · [Config schema](../../packages/modules/uploads/src/config.ts) · [Provider requirements](../../packages/modules/uploads/src/infrastructure.ts) |
| Intent, completion and scanning | [Public routes](../../packages/modules/uploads/src/public.ts) · [Scan worker](../../packages/modules/uploads/src/scan.ts) · [Session protocol](../adr/0072-server-finalized-upload-sessions.md) |
| Persistence and ownership | [Drizzle schema](../../packages/db/src/schema/files.ts) · [Files capability](../../packages/modules/uploads/src/capability.ts) · [Owner lifetimes](../adr/0068-attachment-owner-lifetimes.md) |
| Management and removal | [Admin routes](../../packages/modules/uploads/src/admin.ts) · [Deletion](../../packages/modules/uploads/src/deletion.ts) · [Subject settlement](../adr/0073-subject-export-bounds-and-settlement.md) |
| Client and provider setup | [SDK uploads](../../packages/sdk/README.md#private-uploads) · [Storage contracts and operations](../storage-contracts.md) |

Protected areas fail closed if scanning is unavailable. Choose an area that explicitly allows unscanned files to run without ClamAV. Downloads use short-lived, audited attachment URLs. Detected PNG, JPEG, WebP and GIF support safe inline preview. [Signing deadlines](../adr/0070-private-download-deadlines.md)

Deletion revokes access immediately. Cleanup waits for outstanding upload sessions and removes both storage keys before physical settlement. Keep the owning module, worker and storage reachable until done. [Durable erasure](../adr/0064-upload-ownership-and-durable-erasure.md)

[Upload HTTP tests](../../apps/server/src/uploads.public.test.ts) · [Download tests](../../apps/server/src/uploads.downloads.test.ts) · [M3 evidence](../progress/phase-3.md) · [Approved P3 module plan](https://github.com/nolliebigspin/backbricks/blob/a9fc3188aeca064fcbb87ea63911d0d713fcf362/docs/modules/uploads.md)
