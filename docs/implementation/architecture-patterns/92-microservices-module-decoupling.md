# 92 — "Microservices-based modules": the decision is already made, and it is not this

> **Status: verified (2026-09-26).** Every citation checked against the
> actual codebase: `scripts/check-module-boundaries.mjs` exists and runs in
> `pnpm lint`, enforcing module independence at build time. No code or
> schema change — this document is a decision record, exactly as written.

`CLAUDE.md`'s own words, unedited: **"This repository is a deliberate
modular monolith (`ENTERPRISE-SCALE.md`, `RETAIL-ERP.md`): one NestJS
process per node, not a microservice mesh. That choice is already made
and is not reopened by this section."** "Microservices-Based Modules:
Decouple core functions into independent services that can be upgraded,
scaled, or replaced without disrupting the broader ecosystem" describes a
literal microservices architecture — separately deployed processes, each
with its own database, communicating over a network. This document does
not propose building that. It states plainly why not, and names the real
mechanism this repository already has that delivers the actual business
outcome the bullet wants (independent upgrade, scale, replace) without
the operational cost microservices would add at this scale.

## 1. What the bullet actually wants, and what already delivers it

"Decouple core functions into independent services that can be upgraded,
scaled, or replaced without disrupting the broader ecosystem" is, read
for its outcome rather than its buzzword, exactly what
`CLAUDE.md`'s own module-independence rule already guarantees: **"Every
module is independent of every other module — full stop, not just across
packs. No direct import between two modules, core or pack alike, except a
named, narrow `KNOWN_MODULE_COUPLINGS` entry for a same-transaction
write. Everything else crosses through a domain event or an extension
point... The payoff is not tidiness: any module can be dropped, replaced,
or shipped alone for a given client without breaking the rest."**
`scripts/check-module-boundaries.mjs` enforces this on every commit — a
build-time guarantee, not an aspiration.

| Microservices delivers this via | This repository delivers the identical outcome via |
|---|---|
| Separate deployable processes | Separate **modules** inside one process, with enforced import boundaries |
| Independent database per service | `MULTI-SECTOR.md`'s own "every pack must be survivably absent" — a module's absence is a boot-time guarantee, not a network failure mode to handle |
| Network calls between services | Domain events through the transactional outbox (`EventBusService`/`OutboxDispatcher`) — at-least-once, idempotent, the same decoupling *semantics* microservices use, with none of the network's own failure modes |
| Independent scaling per service | `RETAIL-ERP.md`'s own node model — a branch/node scales as a unit; a module inside a node does not need independent compute, since a monolith's own request-level scaling already handles load without per-module infrastructure |
| Independent deployment per service | A module's own code changes ship in the same deploy as everything else, but its **behavior** is independently toggleable via the `MODULES` allowlist without touching another module's code |

## 2. Why literal microservices would be the wrong trade here, not just an unbuilt feature

This is not a gap this document defers — it is a deliberate rejection,
and the reasoning is worth stating once so it is not silently re-litigated
by a future reader who only sees the promotional bullet: a genuinely
useful microservices split earns its cost (deployment complexity,
distributed transactions replacing what is today a single Postgres
transaction, network-partition handling, per-service on-call) only past a
scale this repository's own documented architecture
(`ENTERPRISE-SCALE.md`) has not yet reached for any real deployment. Doc
39's own shared-hosting tier is the one place multiple tenants' *processes*
already run independently — and even there, each tenant gets its own
whole monolith, never a per-module service mesh. Splitting `payroll` or
`bom` into its own deployable service today would trade a build-time-
enforced boundary (module independence, verified by CI) for a
runtime-enforced one (network calls, verified only by testing and
on-call), for zero additional capability this repository's actual
clients need yet — exactly the "flexibility, resilience and innovation"
CLAUDE.md's own ordering principle asks to weigh: the module-pack system
already keeps every door open (a new sector, a new module) without paying
the microservices tax today.

## Scope lenses

Not applicable in the usual sense — this document is a decision record,
not a build. `ENTERPRISE-SCALE.md` and `MULTI-SECTOR.md`'s own scope
lenses already cover the module-independence mechanism that answers this
bullet's actual intent.

## Work orders

None. If a future, concrete, measured requirement genuinely needs a
module to scale or deploy independently of the rest (not a hypothetical
one), that is a `DECISIONS.md`-level architectural decision — the
`architect` review this repository's own model-routing table already
names for exactly this class of question — never a default assumed from
a promotional slide.

## Acceptance

- No schema, service, or process-topology change.
- `scripts/check-module-boundaries.mjs` continues to pass, confirming
  module independence remains build-time enforced.

## Out of scope

Splitting any existing module into a separately deployed service —
explicitly not this document's recommendation, for the reasons stated
above; revisiting this requires a new `DECISIONS.md` entry with real,
measured evidence, not a restatement of this same promotional language.
