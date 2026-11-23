# ADR-0079 · Scoped test form submissions

- **Status:** Accepted
- **Date:** 2026-11-23
- **Related:** Q25, P5.4d

Test submissions use a project-bound `test:write` key and a separate forms management endpoint. The endpoint validates normal non-file fields, creates an `is_test` inbox entry and returns an ID and the skipped file-field keys. It rejects supplied file references. The pending or accepted public upload lifecycle stays separate, and Scenario A verifies a real PDF claim.

The test write and its audit record are atomic. The write emits no live submission event or usage increment. The entry expires at the form's earlier retention deadline or after seven days. Retention changes preserve that cap.
