# ADR-026 — Seven heavier extensibility mechanisms adopted by explicit owner override: EAV, a metadata-rendering engine, BPMN, micro-frontends, a WASM sandbox, a service mesh, and a dedicated crypto microservice

[← Decision log](../DECISIONS.md)


### Context
Docs 104, 105, 107, 113, 114, 125 and 126 each independently scoped a
narrower, cheaper mechanism in place of a general version of the same
capability — a bounded, code-known custom-field overlay instead of a
general EAV model; a purpose-built form renderer instead of a general
metadata-driven UI engine; `ApprovalChain`'s own data-driven tier
configuration instead of a BPMN engine; a scoped iframe/embed-token
pattern instead of full micro-frontend/module-federation architecture;
a restricted expression evaluator instead of a general WASM sandbox; and,
for cryptography and inter-service trust, an in-process versioned
interface instead of a dedicated microservice or a service mesh. Each of
those seven documents gave real, specific engineering reasons: unindexable
EAV queries, a metadata renderer that cannot enforce the design system,
two competing ways to express business logic if BPMN sits next to typed
services, module-federation cost with no independent-deployment benefit at
this team's size, sandbox-escape risk with no example needing more than
arithmetic, and network-hop cost for problems an in-process interface
already solves.

The owner reviewed this reasoning twice, across two separate exchanges,
and instructed explicitly, a third time, that all seven be built anyway —
stating the reason directly: near-term flexibility for "minor upgradation,
additions" as the product's requirements continue to be discovered, and a
deliberate preference for having the heavier mechanism in place *before*
a specific need forces a rushed version of it later. This is a real,
legitimate business judgment a codebase's own architecture documents
cannot make on the owner's behalf — `CLAUDE.md`'s own ordering states
flexibility and resilience outrank other engineering concerns when they
genuinely conflict, and the owner is the party who bears the cost of
being wrong in either direction.

### Options Considered
1. **Continue declining all seven**, holding the position taken in docs
   104/105/107/113/114/125/126. Rejected: the owner's explicit, twice-
   reconfirmed instruction is new evidence this repository's own
   "don't repeatedly revisit a settled decision without new evidence" rule
   is written to respect, not override — an owner's considered business
   decision, made with the trade-offs stated plainly in front of them
   twice, is exactly this kind of evidence.
2. **Build all seven exactly as their maximal, general form implies**
   (an unbounded EAV table with no entity allowlist, a fully generic
   renderer for every screen, a BPMN engine with no typed fallback, true
   independently-deployed micro-frontends, an unrestricted WASM runtime,
   a full service mesh, a standalone crypto service used for every
   operation). Rejected as the literal implementation: this would recreate
   every specific risk named in the original seven documents in its most
   expensive form, for a "minor upgradation, additions" need that does not
   require the maximal version of any of them.
3. **Build all seven, narrowed by the same engineering judgment that
   produced the original bounded alternatives** — each mechanism gets
   built, honoring the owner's explicit instruction, but scoped with the
   same guardrails the declining documents already identified as the real
   risk (an entity allowlist for EAV, a design-system-compliant renderer
   scope for metadata UI, a typed execution core underneath BPMN's visual
   layer, a narrow embed surface for micro-frontends widened only as real
   partners are named, a resource-and-API-limited sandbox for WASM with a
   mandatory security review gate, and a mesh/crypto-service architecture
   that coexists with — rather than replaces — the modular monolith for
   the specific deployments that actually need it).

### Decision
**Option 3.** All seven mechanisms are built. Each is specified in its own
document (140–146), each narrowed exactly the way the original declining
document already identified as the safe boundary, each still gated by the
review discipline its risk level warrants (in particular, WASM sandboxing
and the service mesh/crypto-service split are flagged for the `security`
subagent's review before any production traffic depends on them, per this
repository's own model-routing table).

### Reasoning
Overriding a documented architectural position without a stated reason
would make every future "no" in this repository's own documents
untrustworthy — the next reader would have no way to know whether a
declined pattern stays declined. Recording *why* it was reversed (an
explicit, informed owner decision, not a discovered flaw in the original
reasoning) keeps both things true at once: the original seven documents'
own engineering analysis remains correct and citable on its own terms,
and the decision to build anyway is equally on the record, for the
reason that actually drove it, rather than silently overwritten as if the
original analysis had been wrong.

### Consequences
- Every one of the seven new documents (140–146) inherits a stated
  narrowing from its own predecessor's reasoning — this decision does not
  grant a blank check to build the least-safe version of any of them.
- Docs 104, 105, 107, 113, 114, 125 and 126 are updated with a pointer to
  this entry and to their own successor document, rather than deleted or
  silently contradicted — their own reasoning remains part of the record.
- The WASM sandbox (doc 144) and the service-mesh/crypto-microservice
  split (docs 145–146) are the three highest-risk items in this set; none
  ships to production without the `security` subagent's own review,
  regardless of how this ADR is read later.
- This repository now carries seven additional standing mechanisms with
  their own operational cost (a second rendering pathway, a second way to
  express approval logic, a second frontend composition layer, a sandboxed
  runtime, a mesh, a separate crypto service) that must each be kept
  correct, tested, and maintained going forward — a real, accepted cost,
  not a free option.

### Status
**Accepted for docs 140–143 (EAV, metadata-UI engine, BPMN, micro-
frontends). Partially superseded by ADR-027** for docs 144–146 (the WASM
sandbox, service mesh, and dedicated crypto microservice), which the
owner withdrew after reviewing their actual security exposure — see
ADR-027 below.
