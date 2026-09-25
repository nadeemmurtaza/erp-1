---
paths:
  - "apps/api/src/core/auth/**"
  - "apps/api/src/**/*.controller.ts"
  - "packages/shared/src/permissions.ts"
---

<!-- Moved verbatim from CLAUDE.md so it loads only when it applies.
     BINDING — identical force to CLAUDE.md itself. Nothing here was reworded.
     Scope: Loads on the files that decide who may do what. -->

## Security engineering

Review: authentication, authorization, permission enforcement, tenant
isolation, branch isolation, input validation, output encoding, SQL
injection, XSS, CSRF, file uploads, secrets, environment variables, rate
limiting, error exposure, logging privacy, dependency vulnerabilities.
Security is enforced **server-side** — client-side restrictions are not
authorization.

<!-- Added with personal API keys (docs/implementation/access-control-identity/163-personal-api-keys.md,
     ADR-037). Scoped here because it applies to controllers and the permission catalogue. -->

## Personal API keys

A request can carry a personal API key (`nxa_…` admin, `nxs_…` storefront)
instead of a session. Both guards fail closed: a key reaches a route only when
the route names a capability of the key's own surface — `@RequirePermission`
for an admin key, `@CustomerScope` for a storefront key.

- **A route that issues, rotates or installs a credential, redirects where an
  already-stored one is sent, or changes an account's sign-in identity,
  carries `@SessionOnly()`** — whatever permission gates it. A key must never
  mint something that outlives it, and must never repoint a credential it
  didn't mint (e.g. a trading partner's `outboundBaseUrl` — changing where a
  decrypted secret gets POSTed is exfiltration by another name).
  `session-only-routes.spec.ts` pins the ones that exist.
- **A customer self-service route an integration should reach gets
  `@CustomerScope('<resource>:read|write')`** from `CUSTOMER_SCOPE_CATALOG`.
  Without one it stays session-only, which is the safe default.
- **A route that changes state takes a `:write` scope, never `:read`**, including
  one inherited from a class-level `@CustomerScope`. `write` implies `read`,
  so a read scope on a write lets every read-only key change state.
  `customer-scope-routes.spec.ts` sweeps every controller for it.
- **A permission that lets its holder widen access** — edit grants, mint a
  principal or a credential, take over an account — goes on
  `NON_DELEGATABLE_PERMISSIONS` in `packages/shared/src/api-keys.ts`, with its
  reason beside it.
