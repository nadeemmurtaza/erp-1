# 145 — A service mesh, built by explicit owner override (ADR-026), scoped to the one real multi-service boundary this repository actually has

Doc 92 kept this repository as a modular monolith and doc 125 declined a
service mesh specifically because there are no internal microservices to
secure traffic between — a mesh has nothing to mesh. Per ADR-026, the
owner instructed this be built anyway, for near-term flexibility as this
system's own topology grows. This document does not reverse doc 92's own
modular-monolith decision (that ADR is not reopened here, and remains the
architecture for `apps/api` itself) — it identifies the actual, real
multi-service boundaries already present in this deployment (which doc
125 did not have occasion to name, since it was answering a request for
mesh-everywhere) and scopes mesh-grade identity verification to exactly
those, narrowly.

## 1. Where a mesh has something real to secure, named honestly

This repository is not a single process — it is already several:
`apps/api` (the monolith), `apps/platform` (doc 39's control plane, a
genuinely separate deployable with its own trust boundary from tenant
data), and, per this same ADR, doc 143's own federated micro-frontend
fragments and doc 144's own sandboxed formula execution, each a
real boundary crossing a network or process edge:

| Real boundary | What crosses it today |
|---|---|
| `apps/api` ↔ `apps/platform` | Provisioning calls, tenant lifecycle events — genuinely two separate trust domains (doc 39's own "shared-infrastructure/isolated-data" ADR) |
| `apps/api` ↔ a registered `OutboundConnector` target (doc 36) | Outbound only, already credentialed per-connector — not a mesh candidate, since it is not two of *this repository's own* services |
| `apps/api` ↔ a `MicroFrontendFragment`'s remote (doc 143) | A federated fragment loaded into the admin shell — an inbound boundary from an externally-deployed artifact |

**`apps/api` ↔ `apps/platform` is the one boundary a mesh genuinely
serves**: two of this repository's own deployables, both under this
organization's own operational control, exchanging real, sensitive
provisioning traffic. This is exactly the shape doc 125 said a mesh needs
to exist for — this document names it rather than building a mesh with
nothing real to mesh.

## 2. The mesh, scoped to that one boundary

```yaml
# A service-mesh sidecar (Linkerd or equivalent — chosen for its smaller
# operational footprint relative to a full-featured mesh, since this
# deployment has exactly one real internal boundary to secure, not
# dozens) enforcing mTLS between apps/api and apps/platform specifically.
# Every other "service-to-service" interaction this repository has is
# either in-process (a function call within apps/api, unaffected) or
# already its own credentialed, doc-36/doc-113-scoped boundary that a
# mesh's own mTLS model does not fit (a third party's own server, not
# this repository's).
```

- **mTLS between `apps/api` and `apps/platform`** — each presents a
  certificate identifying itself, verified continuously, replacing
  whatever static shared-secret or network-level trust (a private VPC,
  an allowlisted IP) currently authenticates this one call path.
- **No mesh sidecar anywhere else** — `apps/web`, `apps/pos`, `apps/mobile`
  all call `apps/api` over the identical public-facing, `JwtAuthGuard`/
  `PermissionsGuard`-checked HTTP API doc 99 already specifies; a mesh
  adds nothing there, since those are already-authenticated end-user
  requests, not service-to-service calls between two of this
  organization's own trusted deployables.

## Scope lenses

**The actor with three tables / The principal with no permission key** —
each service's own mTLS certificate is its actor identity for this one
boundary — a fourth kind of "principal with no permission key," alongside
doc 22's biometric device and doc 30's face-match appliance, all already
answered by the identical "key-hash/certificate principal, never a
`User`" pattern.
**The grant that ends itself** — a compromised or rotated certificate is
revoked immediately via the mesh's own certificate-authority rotation,
without a code deploy — the actual value this mesh delivers for the one
boundary it covers.
**Whose rows, and which columns** — n/a beyond what doc 39's own
isolation boundary already states; the mesh authenticates the *channel*,
`PermissionsGuard`/doc 39's own credential-scoping still governs what
that channel may actually do.
**The threshold nobody approves alone / The toxic pair** — n/a: the mesh
is a transport-security layer, not an authorization decision of its own.
**Authority and blast radius** — who may issue or revoke a service
certificate is an infrastructure-operator action, audited via the mesh's
own control-plane log, distinct from and in addition to `AuditService`'s
own application-level log.
**Audience is a capability, not an address / Request or record / The
movement with no address / The unwritten posting rule / Every column or
none / The period that already moved / The second legal entity / Dry run
before live** — n/a: infrastructure, not a business fact.
**Three silhouettes** — Solo/Chain: `apps/platform` is not even part of a
single-tenant deployment's own topology (doc 39's control plane is
Newax's own, not the tenant's) — this mesh is relevant only at the
scale doc 39's shared-hosting tier actually operates, never inside a
single tenant's own Solo/Chain deployment.
**The absent collaborator** — n/a: the mesh secures an already-mandatory
boundary (`apps/platform` must reach `apps/api` for provisioning to work
at all); there is no "off" state for this boundary to degrade against.
**The second copy of the write / The hundred-thousandth row / The
reversal document / The undo fan-out / The version stamp** — n/a:
transport security introduces no new business write or table.
**The erasure the ledger cannot obey** — n/a: certificates identify
services, never people.
**The failure path** — an expired or invalid certificate on either side
fails the connection closed (never open-and-unverified) — the mesh's own
standard fail-closed behavior, verified against this repository's own
"never silently swallow an error" standing rule.

## Work orders

**WO-145.1 (flagged for `security` subagent review before production
adoption)** — select and deploy a mesh sidecar (Linkerd or equivalent)
scoped to exactly the `apps/api` ↔ `apps/platform` boundary named above.
**WO-145.2 — certificate rotation and revocation runbook**, added to
`docs/implementation/DECISIONS.md` or the deployment operations doc, per
this repository's own documentation-first discipline for anything
touching authentication.

## Acceptance

- `apps/api` ↔ `apps/platform` traffic is mTLS-verified; a request
  presenting an invalid or expired certificate is rejected, proven by a
  test against the mesh's own configuration.
- No other service-to-service path in this deployment gains a mesh
  sidecar — verified by the deployment topology naming exactly one mesh
  boundary.

## Out of scope

A mesh sidecar for every internal call path, including in-process calls
within `apps/api` itself — doc 92's own modular-monolith decision is not
reopened by this document; module-to-module calls inside `apps/api`
remain ordinary function calls, never routed through a network mesh.
