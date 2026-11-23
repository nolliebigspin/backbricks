# ADR-0080 · MCP audit channel

- **Status:** Accepted
- **Date:** 2026-11-23
- **Related:** Q26, ADR-0014, P5.6b–c

The stdio server calls dedicated, scoped management routes for config apply, origin additions and test submissions. The route policy marks the bearer principal's channel after credential authentication. Audit rows record `mcp` and the authenticated key ID. The channel identifies the server route and grants no rights. Client headers do not select the audit actor.

MCP applies the existing config plan with the same project, credential, effective scopes and document. The audit channel is outside the plan digest. Origin additions use a locked read and update so concurrent additions retain existing values. The default agent preset remains unchanged, and `origins_add` requires separately granted `project:write`.
