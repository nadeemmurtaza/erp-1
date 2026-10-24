# 118 — Composable, agent-consumable capabilities: doc 93/98/99's own answers, extended one step by doc 116's MCP adapter

> **Status: corrected (2026-09-26).** Two factual errors, found checking
> this document's citations against the live codebase: (1) `OrdersService
> .createFromPos()` does not exist — the real method is `placeFromPos()`
> (the identical wrong name is repeated in doc 115's own mapping table,
> uncorrected there too); (2) every reference below to "doc 34's
> `ApiClient`" cites a model doc 34 itself marks explicitly deferred —
> "the `ApiClient` below... is the **service account** that [ADR-037]
> deliberately defers... Nothing below is built." The mechanism this
> repository actually shipped for a scoped, non-human caller is doc 163's
> personal `ApiKey` (ADR-037): owned by a `User`, capped by that user's own
> `permissionKeys`/`customerScopes` (from `PERMISSION_CATALOG`/
> `CUSTOMER_SCOPE_CATALOG`), with a mandatory `expiresAt` and dying with
> its owner — not a separate organisation-level principal. Doc 116 (which
> this document quotes) repeats the same `ApiClient` citation and carries
> no `Status:` note of its own; its correction is left for when doc 116 is
> itself verified, not duplicated here. This document's own core theses —
> versioned APIs, one API for every frontend, composable service methods,
> permission/audit enforcement identical for every caller — are otherwise
> confirmed real. See `DECISIONS.md` ADR-055.

"Completely decouple presentation logic from the backend via clean,
versioned APIs, ensuring that visual interfaces and autonomous AI agents
can consume the exact same capabilities with identical reliability.
Expose core capabilities... as independent, composable operations rather
than rigid, monolithic workflows... Enforce granular authorization models
utilizing fine-grained scopes, API-level access controls, and immutable
audit logs" restates three things this batch and the prior one already
answer, plus the one genuinely new element — "autonomous AI agents...
identical reliability" — which doc 116 already scopes as the MCP adapter.

## What already answers each clause

- **"Clean, versioned APIs"** — `app.enableVersioning({ type:
  VersioningType.URI, defaultVersion: '1' })` (cited in doc 98/99),
  already real.
- **"Visual interfaces... consume the exact same capabilities"** — doc
  93's own citation: four frontends, one API, no duplicated business
  logic per surface.
- **"Composable operations rather than rigid, monolithic workflows"** —
  doc 115's own finding: every service method (`InventoryService.move()`,
  `OrdersService.placeFromPos()`) is already a small, independently
  callable operation, not a single giant "do everything" endpoint; a
  controller composes calls to these, it does not embed monolithic logic
  inline.
- **"Autonomous AI agents can consume the exact same capabilities with
  identical reliability"** — doc 116's own `McpToolDefinition` design
  states the pattern correctly, but WO-116.1 is explicit that no adapter
  is built yet ("not built here"): today an agent reaches this
  repository only as a caller of the same REST API a human-facing UI
  calls (doc 163's personal `ApiKey`, below), not through an MCP tool.
  Once built, an MCP tool adapter calling the identical service method an
  HTTP controller calls WOULD give "identical reliability" by
  construction, not by parallel reimplementation — a real property of
  the design, not yet a demonstrated fact of running code.
- **"Fine-grained scopes, API-level access controls, immutable audit
  logs"** — `PermissionsGuard`'s own `PERMISSION_CATALOG` (already
  fine-grained per doc 116's own `requiredPermission` field), doc 163's
  personal `ApiKey` scoping (`permissionKeys`/`customerScopes`, capped by
  the owning `User`'s own live permissions, ADR-037 — not doc 34's own
  `ApiClient`, which that same ADR explicitly defers, nothing built), and
  `AuditService`'s own immutable log — all already real, all already
  applied identically whether the caller is a human session or a scoped
  `ApiKey`.

## The one thing this document adds: naming the risk of "acting on behalf of a human"

"When autonomous systems act on behalf of human users" names a real,
distinct authorization question this repository's shipped `ApiKey`
model (doc 163) does not fully answer for a future *agent* caller
specifically: is an agent acting under its own scoped permissions (an
`ApiKey`'s own `permissionKeys`/`customerScopes`, capped below whatever
its owning `User` currently holds — the model doc 116 already assumes
once an MCP adapter exists), or acting *as* a specific human user with
that user's own broader, live permission set temporarily delegated? The
two have very different blast radii — an agent with its own narrow,
allowlisted tool set and key is safe by construction, since it can never
exceed what its own `ApiKey` already grants; an agent impersonating a
human's full session is not, and this repository does not build the
latter without a real, separately-scoped delegation model (a distinct
`ActingOnBehalfOf` grant, time-boxed, logged, revocable — the same
"grant that ends itself" lens every other delegation in this repository
already answers) if that specific need is ever named.

## Scope lenses

Not repeated — doc 93/98/99/115/116 each already carry complete scope-
lens treatment for their own respective mechanisms; the one open question
above (agent-acting-as-a-human delegation) is deliberately left unbuilt
pending a real, named requirement, consistent with doc 116's own
"curated allowlist, never a blanket capability" stance.

## Work orders

None beyond doc 116's own already-named future work. If a real
requirement for "an agent acting on behalf of a specific human user"
(rather than under its own scoped `ApiKey` permissions) is ever named,
it is scoped as its own document, routed through the `security`
subagent's own review per this repository's model-routing table, given
its trust-boundary and blast-radius implications.

## Acceptance

- No schema or code change — verified by citation to the existing
  versioning, DTO, permission, and audit mechanisms cited across doc
  93/98/99/115/116.

## Out of scope

An "act as this human user" delegation model for AI agents — named above
as a real, distinct, higher-risk capability not built here; a narrow,
self-scoped `ApiKey`-based MCP tool model (doc 116's own design, once
WO-116.1 is built against a real requirement) is the one this repository
would ship, and it does not need this riskier delegation concept to be
useful.
