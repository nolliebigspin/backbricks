# Licensing

Backbricks uses two licenses so that the platform stays open while integrating it stays frictionless.

| Part | Paths | License | SPDX |
|---|---|---|---|
| Server, dashboard, core, modules, adapters, cloud package | `apps/*`, `packages/{core,db,auth,adapters,modules,ui,api-contract,tsconfig}`, `cloud/`, everything not listed below | GNU Affero General Public License v3.0 only | `AGPL-3.0-only` |
| Client libraries and integration material | `packages/sdk`, `packages/cli`, `examples/*`, `skills/*` | MIT | `MIT` |

The full AGPL text is in [`LICENSE`](LICENSE). Each MIT-licensed package contains its own `LICENSE` file. Source files carry an `SPDX-License-Identifier` header (added before `v1.0.0`).

Copyright © 2026 The Backbricks Authors. "The Backbricks Authors" means the individual contributors as recorded in the Git history.

## What this means in practice

- **Using Backbricks from your website or app** (via the API, the MIT-licensed SDK or CLI) does **not** put AGPL obligations on your website, your frontend code or your backend.
- **Self-hosting an unmodified Backbricks** for your own websites or for clients is allowed without restriction.
- **Modifying the Backbricks server and letting others use it over a network** (for example, offering it as a hosted service) requires you to make the source code of your modified version available to those users under the AGPL (section 13).
- **Forks and redistribution** are permitted under the AGPL. Use of the name and logo is governed separately by [TRADEMARKS.md](TRADEMARKS.md).

## Contributions

Contributions are accepted under the license of the part they touch, certified with the [Developer Certificate of Origin 1.1](https://developercertificate.org/) via a `Signed-off-by` line in every commit (see [CONTRIBUTING.md](CONTRIBUTING.md)). There is no CLA. Any future change to this model will be announced before it takes effect and will not apply retroactively to existing contributions.

## Third-party dependencies

Dependencies must be compatible with the license of the package that uses them. MIT-licensed packages must not depend on copyleft code. A dependency license check runs in CI before releases.

---

*This document explains the intended licensing model and is not legal advice. It will be reviewed by a lawyer before the `v1.0.0` release.*
