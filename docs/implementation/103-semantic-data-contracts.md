# 103 — Stable business concepts, not raw tables: already doc 18's own reasoning for existing

"Require third-party applications to integrate via stable business
concepts rather than brittle internal database structures, preventing
vendor lock-in" is, verbatim in intent, doc 18's own stated reason for the
`EdiTranslator`/canonical-JSON boundary
(`18-trading-partner-network.md`): a trading partner integrates against a
canonical JSON shape — a stable business concept ("an order," "a
shipment") — translated by a per-partner `EdiTranslator` into whatever
wire format that partner's own system expects (X12, UBL/Peppol, FBR
e-invoicing), never against `Order`'s own Prisma columns directly. This
document names the pattern once, connecting it to the bullet's own
"vendor lock-in" framing.

## What already enforces this, at two layers

- **External (trading partners, doc 18)** — the canonical JSON schema is
  the "stable business concept"; a partner never sees a raw database
  column name, a foreign-key ID shape, or an internal enum value that
  could change with a migration. Doc 18's own text states the payoff
  directly: a translator "changes zero code for a partner still on
  canonical JSON," and the FBR e-invoicing translator reuses "one
  FBR-shaped `FiscalComplianceProvider` payload rather than re-deriving
  FBR's field requirements a second time... one FBR-shaped schema, never
  independently-guessed FBR schemas" — the same discipline applied
  internally, between modules, as externally, between organizations.
- **Internal (every HTTP route, every module)** — every controller
  returns a DTO shape, never a raw Prisma model (doc 98's own citation of
  `class-validator`-backed DTOs as the actual API contract); a frontend or
  API consumer depends on the DTO's own stable field names, which can
  remain unchanged across an internal schema migration that renames or
  restructures the underlying table — the identical "stable concept over
  brittle structure" principle, enforced by the DTO layer rather than a
  translator, because the trust boundary (an authenticated first-party
  frontend vs. an external trading partner) is different, per doc 18's
  own "inbound stays doc 34's territory... an inbound `ApiClient` and an
  outbound `OutboundConnector` have opposite trust directions" reasoning
  (doc 36) applied here to contract stability instead of delivery
  direction.

## Scope lenses

Not repeated — doc 18's own scope lenses already answer every lens for
the canonical-JSON/`EdiTranslator` boundary; the internal DTO discipline
is covered by ordinary NestJS/`class-validator` convention already
enforced across every controller in this repository.

## Work orders

None. This document connects an existing, already-justified architectural
choice (doc 18's canonical JSON) to the bullet's own "vendor lock-in"
framing, without introducing new schema or a new mechanism.

## Acceptance

- No schema or code change — verified by citation to doc 18's own
  canonical-JSON/`EdiTranslator` design and the DTO pattern already
  enforced across every controller.

## Out of scope

A formal, versioned "business concept" schema registry (e.g., a separate
JSON-Schema/Avro catalogue of every canonical concept, independently
published) — doc 18's own canonical JSON shape and this repository's DTO
classes already serve this purpose informally; formalizing it into a
separate registry is real, distinct tooling work worth scoping only once
a concrete need (e.g., many trading partners needing to discover the
schema programmatically) makes the informal version insufficient.
