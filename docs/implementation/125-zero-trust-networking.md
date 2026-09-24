# 125 — Zero-trust: the principle already holds; the mesh it's usually built for doesn't exist here

> **Status: this document's own position stands, again.** Per **ADR-026**
> (`DECISIONS.md`), the owner briefly instructed that a service mesh be
> built anyway (specified as doc 145). Per **ADR-027**, the owner
> reviewed the actual security trade-off and reversed that instruction —
> doc 145 is withdrawn and deleted. This document's own analysis (the
> zero-trust principle already holds at the one boundary that exists;
> there is no internal microservice mesh to secure) is this repository's
> own current, standing position.

"Enforce strict, continuous identity verification for every internal
microservice interaction. This prevents a breach in a newly adopted,
highly experimental third-party tool from traversing your internal
network" names a mechanism (service-to-service mTLS/identity verification
across a microservice mesh) that presupposes doc 92's own already-declined
architecture: **there are no internal microservices in this repository
for a breach to traverse between**, because this is a deliberate modular
monolith (doc 92's own citation). This document separates the zero-trust
*principle* (worth keeping) from the *mesh* it is usually implemented as
(not applicable here), and states where the principle already applies.

## Where zero-trust's actual principle already holds

"Never trust based on network location; verify every request's identity
and authorization explicitly" is already this repository's own standing
practice, at the one boundary that actually exists — the HTTP request
boundary, not an internal service mesh:

- **Every request, from any caller**, is authenticated by `JwtAuthGuard`
  and authorized by `PermissionsGuard` — doc 99's own citation of
  `CLAUDE.md`'s "API Gateway" mapping. There is no "trusted internal
  network" this repository's own authorization logic ever assumes —
  a request from `apps/web`'s own admin origin is checked exactly as
  strictly as a request from doc 34's external `ApiClient`.
- **A "highly experimental third-party tool"** is, in this repository's
  own vocabulary, exactly what doc 36's `OutboundConnector` and doc 113's
  embed-token pattern already scope narrowly: a third-party tool never
  receives broad network access or a standing credential — an outbound
  connector holds only its own encrypted, revocable credential to one
  target; an embedded widget holds only a short-lived, narrowly-scoped
  token. Neither can "traverse the internal network," because neither is
  ever granted network-level access to begin with — they receive
  scoped, application-level credentials, the correct zero-trust
  primitive for a monolith with no internal network segments to traverse.

## Why a service mesh is not the right implementation of this principle here

Doc 92's own reasoning applies without modification: a service mesh
(mTLS between microservices, per-service identity certificates,
continuous verification at every hop) is infrastructure that earns its
cost only when there are multiple internal services to verify between. A
single NestJS process has no internal network hop to secure — the
"zero trust" that matters is already enforced at the one real boundary
(the HTTP request into `apps/api`), not manufactured between modules that
already communicate via in-process function calls and the transactional
outbox, neither of which crosses a network boundary a mesh could secure
differently than `PermissionsGuard` already does.

## Scope lenses

Not repeated — `PermissionsGuard`/`JwtAuthGuard` and doc 36/113's own
scoped-credential mechanisms already carry complete scope-lens treatment
in their own originating documents.

## Work orders

None. If this repository ever does adopt genuine internal microservices
(a `DECISIONS.md`-level reversal of doc 92's own current stance, with
real, measured justification), a service-mesh-level zero-trust
implementation becomes the correct question to ask again at that point —
not before.

## Acceptance

- No schema or code change — verified by citation to the existing
  `JwtAuthGuard`/`PermissionsGuard` enforcement and doc 36/113's own
  scoped-credential patterns.

## Out of scope

Adopting a service mesh or internal mTLS — not applicable while this
repository remains a single-process modular monolith, per doc 92's own
already-stated reasoning.
