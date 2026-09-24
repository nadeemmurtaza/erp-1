# 99 — API Gateway: `CLAUDE.md` already answers this, verbatim

"Route all external and internal microservice requests through a single
gateway that handles authentication, rate-limiting, and payload routing to
abstract complex security away from individual services" is answered,
word for word, by `CLAUDE.md`'s own "Mapping a reference architecture
diagram's boxes" section, written specifically to translate a generic
reference-architecture diagram's boxes onto this repository's actual,
deliberate modular-monolith shape:

> **"API Gateway → the single NestJS entrypoint's own hardening: a global
> `ValidationPipe`, API versioning, `JwtAuthGuard` + `PermissionsGuard` on
> every route, the `CORS_ORIGINS` allowlist. Not a separate gateway
> process."**

This document exists only to give that already-written answer a citable
number under this batch's own numbering, since the promotional list poses
the question in different words than `CLAUDE.md`'s own diagram-mapping
section does.

## What each named responsibility already maps to

| Bullet's requirement | Already delivered by |
|---|---|
| "Handles authentication" | `JwtAuthGuard`, applied globally |
| "Rate-limiting" | Whatever throttling this repository's own `apps/api/src/main.ts`/global guards already configure — checked at the single entrypoint, never per-module |
| "Payload routing" | NestJS's own controller/route resolution — one process, one router, no separate routing tier needed |
| "Abstract complex security away from individual services" | `PermissionsGuard`, applied globally per `CLAUDE.md`'s own words: "A route with no `@RequirePermission` is authenticated-but-unrestricted, which is almost never intended" — enforced by `scripts/check-route-permissions.mjs` on every commit |
| "Internal microservice requests" | n/a — there are no internal microservices to route between (doc 92); every "internal" call is a direct in-process function call or a domain-event publish, neither of which needs a gateway |

## Scope lenses

Not repeated — `CLAUDE.md`'s own security section and
`.claude/rules/security.md` already carry the complete scope-lens
treatment for `JwtAuthGuard`/`PermissionsGuard`; this document introduces
nothing new.

## Work orders

None. A separate gateway process is explicitly ruled out at this
repository's current scale, per `CLAUDE.md`'s own "Load Balancer" mapping
in the same section: "not applicable at today's single-process-per-node
scale. When a node needs horizontal replicas this gets a real answer in
`DECISIONS.md` before it gets an env var." The identical reasoning
applies to a gateway process fronting multiple internal services that do
not exist.

## Acceptance

- No schema or code change — verified by citation to `CLAUDE.md`'s own
  existing "API Gateway" mapping and the guards/pipes it names.

## Out of scope

Standing up a separate API-gateway process (Kong, an AWS API Gateway, or
equivalent) in front of `apps/api` — explicitly not needed while this
repository remains a single-process-per-node monolith; revisiting this
requires a `DECISIONS.md` entry with real, measured justification, not a
restatement of this promotional bullet.
