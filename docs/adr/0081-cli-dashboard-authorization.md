# ADR-0081 · CLI dashboard authorization

Status: implemented for P6.9, pending maintainer review.

The CLI derives the administration catalog from the declared management policies and Better Auth organization routes. Calls use the same registered endpoints and authorization as the dashboard. Existing project keys retain their scopes and target binding. MCP tools and grants do not change.

An operator signs in with a verified dashboard account in an interactive terminal. The password goes directly to the deployment's existing sign-in endpoint. The CLI retains only the signed dashboard session cookie in an origin-bound private file. It requires an explicit trusted HTTPS deployment URL, with HTTP allowed for loopback development, and rejects redirects. Session expiration and role revocation are server-controlled. Signing out revokes the server session and clears the stored cookie.

Q28 preferred a browser-mediated flow. Using the existing sign-in and session avoids issuing or exchanging a new class of long-lived credentials. Authentication is interactive, and subsequent commands require explicit session selection. Key creation runs under the same verified owner/admin dashboard session and saves the one-time reveal in a new private output file. Service keys and MCP cannot mint credentials.
