# ADR-0012: Public abuse protection with self-hosted proof-of-work

- **Status:** accepted
- **Date:** 2026-11-04
- **Related:** ARCHITECTURE §0 #11, §D.1, §D.5; AGENTS.md I5, I10, I11, I14; PLAN P0.9b, P1.9

## Context

Websites call the public API directly from the browser with a publishable key. An attacker knows the key and every form key and can send requests without a browser. Third-party captchas conflict with the privacy promise (cookies, data transfer to third countries).

## Decision

**Every public write goes through an AbuseGuard pipeline, cheapest checks first:** key/project/instance validity, body limits, rate limits by hashed IP, instance and project, origin check (a signal, not a security boundary), honeypot, **self-hosted proof-of-work using the ALTCHA protocol (`altcha-lib`)** with replay protection, strict schema validation, spam heuristics, quotas, then persistence. Proof-of-work is on by default per instance.

## Consequences

- No third party in the request path, no cookies; works for self-hosters out of the box.
- Protection is about cost and limits, not secrecy; spam goes to a spam folder instead of being dropped.
- The SDK ships a lazily loaded PoW solver; plain HTML forms need a small script or a server-side secret key.
- Other captcha providers can be added later behind the same interface.

## Alternatives considered

- **Cloudflare Turnstile, hCaptcha, Friendly Captcha:** third-party dependency and privacy review. Rejected as defaults; possible as optional providers.
- **Rate limits only:** not enough against distributed spam. Rejected.
