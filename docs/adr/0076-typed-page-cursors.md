# ADR-0076 · Typed page cursors

- **Status** · Accepted 2026-11-22 (Q21)
- **Milestone** · P4.3b

## Context

The shared page helpers encode an ID and creation time. Public Reviews supports three sorts, including two whose first sort key is rating. A lookup of the anchor row on every request would invalidate traversal when that row is deleted or unpublished.

## Decision

Extract bounded base64url JSON encoding and strict, schema-driven decoding from the existing core pagination helper. Preserve the current wire format and behavior for every existing caller. The Reviews module owns its cursor schema and binds it to collection identity and sort. Persist the rating, publication time and review ID in the cursor where they participate in ordering. Validate the typed tuple and use it as parameterized values in the scoped repository. Continue using the existing look-ahead page convention. A cursor carries an ordering position and grants no access.

## Consequences

Old cursors remain valid. Reviews can paginate after an anchor disappears and can reject a cursor from a different collection or sort. Test ties in every order, malformed input, token size, cross-collection use and compatibility with existing cursors. Pages read current data, so separate requests can observe moderation changes between pages.
