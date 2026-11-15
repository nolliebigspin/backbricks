# ADR-0070: Private download deadlines

Status: accepted during P3.6b execution; maintainer review deferred to M3 completion.

A fixed short TTL is insufficient when a file is near expiry. A real delayed-HEAD regression demonstrated that time spent authorizing storage could make a URL signed afterward outlive the file, despite a TTL calculated from its earlier lifetime.

The download handler rechecks remaining time after storage I/O and refuses a remaining lifetime below one second. The provider-neutral storage GET schema also accepts an optional absolute `notAfter` date. An adapter clamps TTL and signs with the same captured clock timestamp; it refuses an elapsed deadline. This keeps provider-specific signature fields out of module logic and protects against delay during signing. Storage interface inputs derive from their schemas rather than duplicate them.

Downloads remain at most 60 seconds, attachment by default, with explicit detected-image previews only. The URL response and actual private byte response prohibit caching. Issued URLs can remain usable after logical revocation until object cleanup or their short expiry; no immediate revocation of an existing signature is claimed.

No new infrastructure or invariant changes. Tests cover actual Garage headers, delayed authorization, and a signing clock that advances between calls.
