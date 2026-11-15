# ADR-0071: Archived project maintenance and bounded recovery

Status: accepted during P3.7a execution; maintainer review deferred to M3 completion.

Archived projects still contain personal records and outstanding object cleanup. Default maintenance fan-out now includes archived, non-erased projects through a worker-only `archivedMaintenance` context. The scoped transaction verifies that context against the actual parent. It permits cleanup and retention, but grants no project-finalization authority; `archivedProject` remains reserved for the erasure worker. Tombstones receive no new maintenance jobs.

Retention hooks may return a validated `{count, more, notBefore}` result as well as the compatible numeric result. Deleted-record counts remain truthful while cleanup or recovery work can request a bounded, delayed continuation. Upload maintenance shares one batch budget across expired records, due deletion, post-expiry staging cleanup and stalled inspection recovery. Partial indexes support each selection. Archived projects do not restart inspection.

Storage metadata calls have bounded deadlines so a failed provider cannot hold a project transaction indefinitely. Cleanup records a conservative staging-deletion start time, requiring a post-expiry confirmation before dropping identity. Provider failures remain delayed, durable retries. This alone cannot settle an in-flight raw PUT accepted before expiry; P3.7a1 closes that separate gap with server-finalized sessions (ADR-0072).

Real Postgres/Garage tests prove 105-record concurrent retention, lost cleanup/scan job recovery, unlimited-retention 24-hour orphans, archived project/zone maintenance, neighbour isolation and refusal of erasure authority. No new infrastructure or invariant changes.
