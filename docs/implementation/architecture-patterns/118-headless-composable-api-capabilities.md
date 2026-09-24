# 118 — Composable, agent-consumable capabilities: doc 93/98/99's own answers, extended one step by doc 116's MCP adapter

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
  `OrdersService.createFromPos()`) is already a small, independently
  callable operation, not a single giant "do everything" endpoint; a
  controller composes calls to these, it does not embed monolithic logic
  inline.
- **"Autonomous AI agents can consume the exact same capabilities with
  identical reliability"** — doc 116's own `McpToolDefinition` design:
  an MCP tool adapter calls the *identical* service method an HTTP
  controller calls, so a human-facing UI and an AI agent genuinely
  exercise the same code path, the same validation, the same permission
  check — "identical reliability" by construction, not by parallel
  reimplementation.
- **"Fine-grained scopes, API-level access controls, immutable audit
  logs"** — `PermissionsGuard`'s own `PERMISSION_CATALOG` (already
  fine-grained per doc 116's own `requiredPermission` field), doc 34's
  `ApiClient` scoping, and `AuditService`'s own immutable log — all
  already real, all already applied identically whether the caller is a
  human session or an agent's `ApiClient`.

## The one thing this document adds: naming the risk of "acting on behalf of a human"

"When autonomous systems act on behalf of human users" names a real,
distinct authorization question this repository's own `ApiClient`
model (doc 34) does not yet fully answer: is an agent acting under its
*own* scoped permissions (the model doc 116 already assumes), or acting
*as* a specific human user with that user's own broader permission set
temporarily delegated? The two have very different blast radii — an
agent with its own narrow, allowlisted tool set (doc 116's own design) is
safe by construction; an agent impersonating a human's full session is
not, and this repository does not build the latter without a real,
separately-scoped delegation model (a distinct `ActingOnBehalfOf` grant,
time-boxed, logged, revocable — the same "grant that ends itself" lens
every other delegation in this repository already answers) if that
specific need is ever named.

## Scope lenses

Not repeated — doc 93/98/99/115/116 each already carry complete scope-
lens treatment for their own respective mechanisms; the one open question
above (agent-acting-as-a-human delegation) is deliberately left unbuilt
pending a real, named requirement, consistent with doc 116's own
"curated allowlist, never a blanket capability" stance.

## Work orders

None beyond doc 116's own already-named future work. If a real
requirement for "an agent acting on behalf of a specific human user"
(rather than under its own scoped `ApiClient` permissions) is ever named,
it is scoped as its own document, routed through the `security`
subagent's own review per this repository's model-routing table, given
its trust-boundary and blast-radius implications.

## Acceptance

- No schema or code change — verified by citation to the existing
  versioning, DTO, permission, and audit mechanisms cited across doc
  93/98/99/115/116.

## Out of scope

An "act as this human user" delegation model for AI agents — named above
as a real, distinct, higher-risk capability not built here; doc 116's own
narrow, self-scoped `ApiClient`-based MCP tool model is the one this
repository actually ships, and it does not need this riskier delegation
concept to be useful.
