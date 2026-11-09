# ADR-0056: Module-owned configuration reads

- **Status:** accepted during execution; D54 awaits maintainer confirmation
- **Date:** 2026-11-09
- **Task:** P2.5a; ADR-0037/0040/0055; I1/I2/I13

## Context

Submission details need the configuration revision that originally validated them. Modules receive only their own repository and restricted services, so they cannot use platform instance/revision repositories directly. The first production management routes also use strict parameter schemas.

## Decision

The core [runtime](../../packages/core/src/modules/contract.ts) provides read-only `instances.get(key)` and `instances.revision(key, version)`. The [implementation](../../packages/core/src/modules/instances.ts) fixes the module type from the execution frame, uses the caller's tenant transaction and lifetime guard, rejects archived/missing instances, and migrates configurations through the existing pure configuration hook without writes. No tenant/module selector, mutation method or platform repository is exposed. Historical reads first resolve the owning instance and only then load its revision.

The [HTTP bridge](../../apps/server/src/routes/modules.ts) removes its trusted `projectId` selector before calling a module's strict input schema. Tenant authorization remains in the central registrar; it is not a module parameter.

Arbitrary stored JSON uses the shared `jsonValueWireSchema`: the same JSON validator behind an opaque HTTP schema, following the existing instance config pattern. This avoids the installed OpenAPI adapter's recursive-schema stack overflow. Module JSON response declarations may use opaque schemas, but the registrar validates the parsed output as JSON before responding. No unsafe response type, copied validator or hand-edited generated contract is introduced.

## Verification and consequences

The [HTTP tests](../../apps/server/src/forms.admin.test.ts) first failed on the absent list route, then exposed the strict-parameter bridge bug. They verify pagination, selected list fields, summary counts and original labels after two config revisions, with removed values under additional data. The [isolation cases](../../apps/server/test/isolation/forms-cases.ts) exercise the three new management operations with sessions and project-bound keys, foreign IDs, foreign organizations and sibling projects. The registered response schemas exclude tenant identifiers and unnecessary private fields from list projections. No invariant changes; future modules reuse this read seam.
