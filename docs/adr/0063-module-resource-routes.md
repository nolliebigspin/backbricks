# ADR-0063: Module-owned resource routes and public instance resolution

- **Status:** accepted; maintainer approved the plan and Q17–Q20 on 2026-11-15
- **Date:** 2026-11-15
- **Related:** P3.3a; ADR-0037/0039/0046/0055; I1/I2/I3/I5/I13/I19

## Context

The current module HTTP bridge prefixes every route with the module's primary resource and the public guard resolves an instance from a URL key parameter. Uploads needs both `upload-zones` and project-level `files`, including the specified `POST /v1/public/files/{fileId}/complete`. A file ID is not a zone key. Hard-coding uploads queries in the server or doing an unscoped file lookup would violate the module/tenant boundary.

## Decision

Extend the module router contract with explicit ownership of additional resource namespaces. Registration must reject duplicate/host-reserved namespaces, overlapping routes and tenant selector shadowing; the host still owns `/v1/public` and `/v1/projects/{projectId}`. Existing routes retain their current prefix by default.

A resource-bound public route may provide a typed instance resolver. The host invokes it in a module-owned frame **after credential bootstrap and inside `withTenant`**, with bounded request data. It sees only the module's own repository and returns the owning instance key. The uploads resolver validates the file ID/token from the request body and returns no file metadata. It cannot choose a tenant, obtain another module's repository or bypass the normal guard.

The existing guard then enforces active project/zone, credential scope, origins/CORS, body/rate limits and proof-of-work; the domain transaction rechecks binding/token/state under locks. Cookie/key isolation inventory and public-response inventory include these routes. Invalid/foreign references return 404; tokens never enter URLs, log fields, audit, events or jobs.

The SDK polls by repeating token-authenticated completion with fresh proof and bounded backoff. No new unauthenticated status route or alternate credential bootstrap is introduced.

## Consequences and alternatives

- Preserves the specified URL structure and headless API while keeping upload domain queries in uploads.
- Adds one generic, bounded route-binding seam; current forms routes remain unchanged.
- A zone-qualified alternative would avoid the resolver but change the planned public API and project-wide management paths. Upload-specific server wiring would duplicate domain ownership. Neither is recommended.
- No invariant, infrastructure or key-bootstrap exception changes. Approval covers the contract extension, not future arbitrary module namespaces.
