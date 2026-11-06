# ADR-0013: Presigned PUT uploads with copy-then-scan

- **Status:** accepted
- **Date:** 2026-11-04
- **Related:** ARCHITECTURE §0 #12, §D.6, §F.3, §J.2 #5; AGENTS.md I9; PLAN P0.9b, P3.3–P3.4

## Context

Visitors upload files up to 100 MB from customer websites. The app must not proxy large files, files must stay private, and malware scanning must not have a gap where a still-valid upload URL could overwrite an already scanned file.

## Decision

**Browsers upload with a presigned PUT (5 minutes, signed `Content-Length` and `Content-Type`) to a staging key. After `complete`, the worker copies the object to a final key for which no upload URL was ever issued, deletes the staging object, checks magic bytes against the allowlist, hashes and optionally scans it with ClamAV.** Files are private; downloads use short-lived presigned GETs with `Content-Disposition: attachment`. Object keys never contain the original file name.

## Consequences

- The app never streams large uploads (except the optional `UPLOAD_MODE=proxy` for setups without reachable storage, P6.3).
- The scanned file can't be replaced by a second PUT to the old URL.
- Correctness depends on the storage enforcing signed headers; this is checked in the P0 spike and covered by the storage contract suite (P3.10).
- `SCANNER=none` is allowed for self-hosters; the dashboard marks such files "not scanned".

## Alternatives considered

- **Uploads through the app:** simpler, but large files tie up the API process. Kept only as the proxy fallback.
- **Scan in place on the upload key:** leaves an overwrite-after-scan gap. Rejected.
