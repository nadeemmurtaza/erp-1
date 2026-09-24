# 98 — Contract-first vs. code-first: this repository is code-first, deliberately, and that is a distinction worth stating plainly

"Define APIs as standardized contracts before writing backend logic,
allowing frontend and third-party developers to build against stable,
predictable interfaces" names a specific development *sequence*
(write the OpenAPI spec, then generate code/stubs from it) that this
repository does not follow. What this repository does instead — and
already does consistently — is **code-first**: `@nestjs/swagger`
decorators (`@ApiOperation`, `@ApiTags`, DTO classes with
`class-validator` decorators) generate the OpenAPI document *from* the
controller and DTO code, not the other way around. This document names
the distinction honestly rather than claiming a sequence this repository
does not practice, and identifies what actually keeps a "stable,
predictable interface" true here instead.

## What already makes the interface stable, without contract-first sequencing

- **Every DTO is validated at the boundary** — a frontend or third-party
  developer building against an endpoint gets the same `class-validator`
  rejection a malformed request would trigger in production; the DTO
  class *is* the contract, generated into the OpenAPI document
  automatically, never hand-maintained separately from the code that
  enforces it (which is precisely the risk contract-first is meant to
  avoid — a spec drifting from the implementation — solved here by
  having exactly one artifact instead of two kept in sync).
- **API versioning** (`app.enableVersioning({ type: VersioningType.URI,
  defaultVersion: '1' })`) — a breaking change to a v1 route is a new v2
  route, never a silent behavior change under the same path, so a
  third-party integrator's existing calls do not break out from under
  them.
- **Doc 18's own canonical-JSON boundary for trading partners** — the one
  place this repository already treats external contract stability as a
  first-class concern beyond its own frontends: a trading partner
  integrates against a canonical JSON shape, translated by an
  `EdiTranslator`, insulated from this repository's own internal DTO or
  database changes (doc 18's own "vendor lock-in" reasoning, restated in
  doc 103 below for the bullet that names it directly).

## The one honest gap: no automated contract-diff / backward-compatibility check

Doc 38's own WO-38.5 ("contract test suite: one test per domain event in
`core/events`'s catalogue, run in CI, failing on a payload shape change
with no corresponding subscriber update") already covers this discipline
for **domain events**. No equivalent exists today for **HTTP DTOs** — a
breaking change to a v1 endpoint's response shape is caught by whatever
tests exercise that endpoint, not by an automated "does this OpenAPI diff
break a third party" check. This is a real, narrow, honestly-named gap,
not yet built.

## Scope lenses

Not repeated — no schema or write-path change; this document names an
existing practice and one gap rather than introducing a new mechanism.

## Work orders

**WO-98.1 (named future work, not built here)** — an OpenAPI-diff check
in CI (comparing the generated spec across a PR against `main`'s own spec,
flagging a removed field or a changed type as a breaking-change warning)
would close the one gap named above, mirroring doc 38's WO-38.5 for HTTP
DTOs instead of domain events. Not built speculatively here; scoped as
its own small CI-tooling document if a real breaking-change incident ever
justifies it.

## Acceptance

- No schema or code change — verified by citation to the existing
  `@nestjs/swagger`/`class-validator`/versioning mechanisms.
- The code-first vs. contract-first distinction is stated honestly in any
  client-facing description drawing on this document, never overclaimed
  as "contract-first."

## Out of scope

Rewriting the API-development workflow to be spec-first (writing OpenAPI
YAML by hand before controllers) — a real process change with real cost
(two artifacts to keep in sync) for a benefit (spec review before
implementation) this repository's own team size has not shown a need for;
named as a deliberate choice, not an oversight.
