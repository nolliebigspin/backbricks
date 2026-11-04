---
description: Independent review of a finished phase against architecture and invariants (run in a fresh session)
argument-hint: P<N>
---

You did not take part in the implementation. Review the state after phase **$ARGUMENTS** against `docs/ARCHITECTURE.md`, `docs/MILESTONES.md` and the rules and invariants I1–I19 in `CLAUDE.md`.

1. Run `bun run check`.
2. Check every invariant individually with concrete locations (file:line) or missing tests.
3. Look specifically for: queries without tenant scoping, routes without role/scope declaration, public responses with private fields, secrets in logs, mutations without audit entries, cross-module imports, `dangerouslySetInnerHTML`, unchecked uploads.
4. Look for **duplication and architecture drift**: concepts implemented twice, helpers that belong in core, hand-written types that should be derived (Zod/OpenAPI), copy-pasted UI that belongs in `packages/ui`. Use the code graph.
5. Verify the phase acceptance criteria were actually demonstrated.

Output: `docs/progress/review-phase-<N>.md` with findings by severity (critical/high/medium/low), each with location, scenario and suggested fix. Do not change code.
