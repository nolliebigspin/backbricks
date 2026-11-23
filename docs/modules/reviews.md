# Reviews

Reviews stores private submissions for moderation. Approved, published, unexpired, non-test reviews feed the public list and rating statistics. The public projection follows the collection's field policy and omits submitter contact details.

| Area | Source |
| --- | --- |
| Configuration, rating scale and templates | [Module definition](../../packages/modules/reviews/src/module.ts) · [Schema](../../packages/modules/reviews/src/config.ts) |
| Public writes, reads and stats | [Submission](../../packages/modules/reviews/src/public.ts) · [Reads](../../packages/modules/reviews/src/read.ts) |
| Moderation, persistence and lifecycle | [Admin routes](../../packages/modules/reviews/src/admin.ts) · [Drizzle schema](../../packages/db/src/schema/reviews.ts) · [Lifecycle](../../packages/modules/reviews/src/lifecycle.ts) |
| Dashboard and client | [Dashboard](../../apps/web/src/modules/reviews/pages.tsx) · [SDK](../../packages/sdk/README.md#reviews) · [HTML example](../../examples/html/README.md#testimonials-and-ratings) |

Public list and stats use conditional revalidation. The list checks the collection revision before returning records, so a concurrent field-policy edit cannot disclose fields from the old policy. [ADR-0077](../adr/0077-conditional-public-review-reads.md)

Moderation writes return status metadata. Private details require the read policy. Actions and lifecycle changes use the tenant-scoped repositories and audit path.

[Reviews HTTP tests](../../apps/server/src/reviews.test.ts) · [Lifecycle tests](../../apps/server/src/reviews.lifecycle.test.ts) · [M4 evidence](../progress/phase-4.md) · [Approved P4 module plan](https://github.com/nolliebigspin/backbricks/blob/a9fc3188aeca064fcbb87ea63911d0d713fcf362/docs/modules/reviews.md)
