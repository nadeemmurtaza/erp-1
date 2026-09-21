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
