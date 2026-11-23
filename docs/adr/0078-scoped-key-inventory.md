# ADR-0078 · Scoped key inventory

- **Status:** Accepted
- **Date:** 2026-11-23
- **Related:** Q24, ADR-0014, P5.4e

The existing project key list also accepts a project-bound secret with the explicit `keys:read` scope. Provision that grant in a dashboard session. The agent preset and MCP tool list retain their existing scope boundaries. Creation and revocation still require dashboard sessions. The inventory reuses the existing metadata projection and pagination, which exclude credential values and hashes.

The route declaration and key service both enforce the inventory permission. A bearer inventory response clears the existing public-token field, and dashboard sessions retain their current projection. The tenant isolation suite exercises own-project access and denies sibling and foreign projects.
