# ADR-0053: Dashboard account boundary

- Status: Accepted
- Date: 2026-11-06
- Task: P1.12a

## Decision

The dashboard uses the pinned public Better Auth React/organization clients without importing the server auth instance. A same-origin client adds the required CSRF header. The generated admin client reads the public account-capability endpoint, whose schema/policy derive from the existing configuration and password limit. It exposes only signup policy, email availability and minimum password length; no provider settings or tenant data.

Account screens use shared shadcn inputs, labels, buttons and cards, native form constraints, server validation and en/de message keys. React Hook Form/resolvers are unnecessary for these short native forms, so no extra form dependency is introduced. Installed Better Auth 1.7.18 client types/source and real browser requests determine compatibility. The invitation signup extension uses the client's supported fetch body option, then the existing server validates and atomically accepts the invitation.

The protected dashboard waits for a live session; cookies remain HttpOnly. Reset tokens stay only in component memory and are removed from the address bar immediately. No analytics, persistent token storage or auth mutation cache is added. Redirects accept local, same-origin paths only. Errors render fixed translated messages rather than server text or caller input. The existing server checks remain authoritative for signup policy, invitation identity/expiry and CSRF.

## Evidence

Component tests cover closed registration, expired reset links and translation parity; navigation tests reject external/protocol-relative/backslash redirects. Playwright exercises signup, Mailpit verification, sign-in/out, Mailpit password reset and a malicious redirect against the actual server, database and durable worker. The E2E process migrates first and runs the combined role with explicit open signup and local Mailpit, independently of production defaults.
