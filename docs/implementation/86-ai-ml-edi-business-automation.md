# 86 — AI/ML/EDI: already two named extension points, not a claim to build fresh

"End-to-end business automation backed by stated expertise in AI, Machine
Learning, and EDI (Electronic Data Interchange) integrations" describes,
at the architecture level, two extension points this repository already
names and builds against:

- **`AiProvider`** (doc 09, `09-ai-layer.md`) — the registered-provider
  interface for AI/ML-backed features (already referenced across this
  batch set's own automation examples — doc 30's face-match scoring,
  recommendation-style features noted in doc 09 itself), never a hard
  dependency on one vendor's model.
- **`EdiTranslator`** (doc 18, `18-trading-partner-network.md`) — the
  registered-translator interface for X12/UBL/Peppol/FBR e-invoicing
  formats, explicitly built so "a partner still on canonical JSON" costs
  zero code changes and a partner needing EDI translation is a new
  translator implementation, never a rewrite of the trading-partner
  pipeline itself.

"End-to-end business automation" is marketing language describing the sum
of every module this repository already ships (orders, purchasing,
finance, inventory, payroll, all wired through domain events rather than
manual handoffs) — not a discrete capability with its own schema. This
document is a coverage note naming where the two specifically-called-out
technologies (AI/ML, EDI) already live architecturally.

## Scope lenses

Not repeated — doc 09 and doc 18 each already carry their own complete
scope-lens treatment for their respective extension points; this document
introduces no new schema, write path, or permission.

## Work orders

None against this bullet. A specific AI/ML feature request or a specific
trading partner's EDI format is scoped as its own document when a real
requirement names it — per doc 09's own "no speculative AI feature" and
doc 18's own "a translator is built when a partner actually needs X12,
UBL/Peppol, or FBR e-invoicing translation" (doc 18's own words), never
spec'd ahead of a real partner.

## Acceptance

- No schema, service, or permission change — verified by citation to doc
  09 and doc 18's own existing extension points.

## Out of scope

Nothing further — this domain has no remaining gap; this note exists so
the promotional list's own bullet has a corresponding, citable document.
