# Security policy

Corbel processes personal data and files from public websites, so we take security reports seriously.

## Reporting a vulnerability

**Do not open a public issue.** Report privately through GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability) ("Report a vulnerability" in this repository's Security tab).

Please include affected version/commit, a description, reproduction steps and the impact you expect. Don't access data that isn't yours, and don't run tests that degrade service for others.

## What to expect

- Acknowledgement within 3 business days
- An initial assessment within 10 business days
- Coordinated disclosure: we agree on a publication date once a fix is available (default: up to 90 days)
- Credit in the advisory if you want it

## Supported versions

| Version | Supported |
|---|---|
| Latest minor of the current major | ✅ |
| Pre-1.0 developer previews (`0.x`) | Latest release only |

## Scope

In scope: this repository (server, dashboard, modules, SDK, CLI, MCP server, deployment files). Of particular interest: tenant isolation, authentication and key handling, upload processing, public endpoints and data exposure. Third-party services and self-hosted deployments with modified code are out of scope.
