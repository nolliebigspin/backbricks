# Forms

Forms accepts validated JSON and native HTML submissions and provides an inbox, notifications and CSV export. Uploads is optional. File fields use its declared capability when enabled.

| Area | Source |
| --- | --- |
| Configuration, fields, templates and codegen | [Module definition](../../packages/modules/forms/src/module.ts) · [Schema](../../packages/modules/forms/src/config.ts) |
| Public schema and submissions | [Routes](../../packages/modules/forms/src/public.ts) · [Answer validation](../../packages/modules/forms/src/validator.ts) · [Shared guard and HTML redirects](../adr/0046-public-write-guard-and-cors.md) |
| Inbox, mutations, test submissions and CSV | [Admin routes](../../packages/modules/forms/src/admin.ts) · [Test submissions](../../packages/modules/forms/src/test-submissions.ts) · [CSV](../../packages/modules/forms/src/export.ts) |
| Persistence, privacy and attachments | [Drizzle schema](../../packages/db/src/schema/forms.ts) · [Lifecycle](../../packages/modules/forms/src/lifecycle.ts) · [Attachment capability use](../../packages/modules/forms/src/attachments.ts) |
| Client integration | [HTML examples](../../examples/html/README.md) · [SDK](../../packages/sdk/README.md#private-uploads) |

Native HTML uses configured origin-checked redirects. JSON submissions use the shared public write guard and idempotency. Flagged CLI tests validate non-file inputs and stay out of live notifications and metrics. Verify required attachments with a real browser submission. [Test submission decision](../adr/0079-test-form-submissions.md)

Protected data follows the declared route policy. CSV export is audited and session-authorized. Retention, subject erasure and entry deletion use the module lifecycle and release owning files through the capability. [CSV decision](../adr/0058-audited-paged-csv-exports.md) · [Erasure decision](../adr/0057-forms-data-mutations-and-batched-erasure.md)

[Forms HTTP tests](../../apps/server/src/forms.public.test.ts) · [HTML tests](../../apps/server/src/forms.html.test.ts) · [M2 evidence](../progress/phase-2.md) · [Approved P2 module plan](https://github.com/nolliebigspin/backbricks/blob/a9fc3188aeca064fcbb87ea63911d0d713fcf362/docs/modules/forms.md)
