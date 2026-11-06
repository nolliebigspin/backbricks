# ADR-0023: Platform schema integrity

- **Status:** accepted
- **Date:** 2026-11-06
- **Related:** I1/I11/I12; ADR-0021/0022; DEV-11; P1.2b; ARCHITECTURE §B.3/§F.4/§F.6

## Context

Independent project/instance foreign keys do not prevent combining a valid organization ID with another tenant's project, or combining one project's revision/rule with a sibling project's instance. Audit references also need to outlive live resources without making an immutable audit row block their eventual erasure.

## Decision

- Live project children reference `(organization_id, project_id)`; instance children reference `(organization_id, project_id, instance_id)`. Parent uniqueness supports those composite foreign keys. Revisions also store `module_version` so historical configurations remain interpretable across format upgrades.
- Audit `organization_id`/`project_id` are historical identifiers, not cascading foreign keys. The audit service must validate its trusted tenant context on insert; no request may insert arbitrary audit tenant IDs. Audit rows retain tenant columns and expiry, while deletion of a live parent cannot modify/delete the retained audit. Target/actor IDs similarly describe history. This is a reference-lifecycle distinction, not an exception to scoped audit reads or I1.
- Central Zod value schemas define key kinds, actor types, instance statuses and notification channels; Postgres enums derive from those values. Platform writes supply timestamps from the injected clock rather than relying on implicit database defaults.
- Audit UPDATE is always forbidden. DELETE requires a transaction-local maintenance flag and an already-expired row; even the flag cannot delete a current row. The trigger and UNLOGGED rate-bucket setting live in a custom migration, since the ORM schema does not represent them. The maintenance flag is not a privileged database role: access to raw transactions must remain restricted by repositories/composition boundaries.
- Idempotency includes organization/project parent consistency, bounded expiry and only successful public responses. Outbox/audit/rate/replay expiry columns are indexed; recipient configuration follows ADR-0022's active lifecycle. Global technical tables are explicitly rate-limit buckets, proof-of-work replay signatures and system settings, not tenant records.
- Membership uniqueness `(organization_id, user_id)` is enforced in the custom migration, preventing duplicate access rows from concurrent invitations. The generated auth schema remains unchanged; custom invariants have one SQL source.

Q7's recommended execution baseline remains project **archive** for the M1 API; hard erasure/ownership transfer are not exposed without their complete audited lifecycle. Schema cascades support future erasure but do not themselves implement that workflow. No personal record is soft-deleted by this choice.

## Consequences

- Foreign parent combinations fail at the DB boundary as well as in scoped repositories.
- Audit insertion/read authorization is essential; historical references deliberately cannot prove live ownership through a foreign key. Tests must prove both tenant scoping and survival after erasure.
- The custom trigger, membership constraint and UNLOGGED declaration must remain in the central migration history. Future auth regeneration must not silently erase these invariants.
- Native enum additions require additive migrations; public values remain defined once in core. No domain tables or cloud infrastructure are added in M1.

## Alternatives considered

- **Only independent foreign keys:** allow inconsistent tenant parents; rejected.
- **Cascading audit references:** conflict with append-only retention and block complete erasure; rejected.
- **Maintenance flag permits audit updates:** unnecessary and weakens append-only behavior; rejected.
