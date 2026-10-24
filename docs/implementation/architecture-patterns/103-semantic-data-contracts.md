# 103 — Stable business concepts, not raw tables: real at the DTO layer; doc 18's own translator layer is not built

> **Status: corrected (2026-09-26).** This document's original text built
> its entire "external layer" claim on doc 18's `EdiTranslator`/canonical-
> JSON boundary — verified false: `EdiTranslator` does not exist anywhere
> in `apps/api/src` or `apps/api/prisma`, nor does `FiscalComplianceProvider`
> (also cited below), and neither doc 18 nor doc 36 (the connectivity
> framework `EdiTranslator` would sit on) carries a `Status:` note — both
> are unbuilt proposals. What is real and verified: the trading-partners
> module (`apps/api/src/modules/supply-chain/tradingpartners/`) already exposes
> offers, quotes and invoices to a linked `TradingPartner` through
> ordinary DTO-validated endpoints — a real, narrower instance of "a
> partner integrates against a stable shape, not a raw table," just
> without the multi-wire-format (X12/UBL/Peppol/FBR) translation layer
> doc 18 sketched. The document is corrected below to make this claim on
> what actually ships; building doc 18/36's own translator is separate,
> larger work and is not undertaken here.

"Require third-party applications to integrate via stable business
concepts rather than brittle internal database structures, preventing
vendor lock-in" describes an outcome this repository achieves today at
one real layer (the DTO boundary, for every consumer including trading
partners) and does not yet achieve at a second, larger one doc 18 sketched
but never built (a canonical-JSON shape translated per-partner into
whatever wire format their own system expects). This document names both
honestly rather than citing the unbuilt one as if it already shipped.

## What already enforces this, at one real layer

- **Every HTTP route, every module, trading partners included** — every
  controller returns a DTO shape, never a raw Prisma model (doc 98's own
  citation of `class-validator`-backed DTOs as the actual API contract); a
  frontend, a first-party consumer, or a linked `TradingPartner` calling
  `apps/api/src/modules/supply-chain/tradingpartners/` all depend on a DTO's own stable
  field names, which can remain unchanged across an internal schema
  migration that renames or restructures the underlying table. This is
  the real, shipped instance of "stable concept over brittle structure" —
  enforced by the DTO layer, the same mechanism for every caller,
  first-party or trading partner alike.

## What is not built: a per-partner wire-format translator

Doc 18's own `EdiTranslator` sketch — one canonical JSON shape translated
per-partner into X12, UBL/Peppol, or FBR e-invoicing — would be a second,
larger layer on top of the DTO boundary above, insulating a partner from
even this repository's own *chosen* JSON field names, not only its
database structure. That is real, useful scope for a partner running a
system that cannot consume this repository's own DTO shape directly — but
it does not exist today, and this document does not claim otherwise.

## Scope lenses

Not repeated — the DTO discipline that is real is covered by ordinary
NestJS/`class-validator` convention already enforced across every
controller in this repository; doc 18/36's own unbuilt translator layer
carries no scope-lens treatment here since nothing here builds it.

## Work orders

None. This document connects an existing, real mechanism (the DTO
boundary, including the trading-partners module's own endpoints) to the
bullet's own "vendor lock-in" framing, without introducing new schema or
a new mechanism.

## Acceptance

- No schema or code change — verified by citation to the DTO pattern
  already enforced across every controller, including
  `apps/api/src/modules/supply-chain/tradingpartners/`.
- This document's own corrected text draws no claim from doc 18's unbuilt
  `EdiTranslator`/`FiscalComplianceProvider` sketch.

## Out of scope

Building doc 18's own `EdiTranslator`/canonical-JSON translator layer — a
real, separate, larger work order (multi-wire-format support per linked
partner), not undertaken here; a formal, versioned "business concept"
schema registry independent of that — this repository's DTO classes
already serve the real need informally, and formalizing it into a
separate registry is worth scoping only once a concrete need (many
trading partners needing to discover a schema programmatically) makes the
informal version insufficient.
