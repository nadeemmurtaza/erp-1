# 112 — Pluggable fiscal engines: this is doc 15's own name for itself

"Decouple tax calculation and regulatory reporting into isolated modules.
When entering a new market or facing a new legal mandate, you swap in the
specific regional compliance module without altering the global core
financial ledger" is doc 15's `FiscalComplianceProvider` extension point,
already cited three times this document set (doc 15 itself, doc 88's
PRAL/FBR/PRA note, and doc 112 here for a fourth). No new content beyond
pointing directly at doc 15 and doc 88 is needed — this document exists
so this batch's own "Polyglot Multi-Tenant" framing has a citable answer
under its own heading, since the underlying mechanism does not change
just because the promotional language does.

## What already exists

- **`FiscalComplianceProvider`** (doc 15) — `authority: string`, never a
  closed enum; FBR (WO-15.5) and PRA (WO-15.6) are each their own
  implementation, blocked on real requirements per doc 15's own explicit
  caution.
- **The ledger stays untouched per provider** — doc 15's own design
  already separates "does this order owe fiscal reporting to authority X"
  from "how does the GL post the resulting entry" — a new authority is a
  new provider implementation, never a change to `JournalEntry` or the
  chart of accounts.
- **Doc 88's own restatement for a specific third authority** (PRAL) —
  already the direct precedent for "entering a new market": confirm real
  requirements, implement a new provider, ship, with zero change to the
  core ledger.

## Scope lenses

Not repeated — doc 15's own scope lenses already answer every lens for
this exact mechanism.

## Work orders

None beyond doc 15's own already-specified WO-15.5/15.6, and doc 88's own
WO-88.1 for a third/fourth authority once real requirements are
confirmed.

## Acceptance

- No schema or code change — verified by citation to doc 15 and doc 88's
  own existing mechanisms.

## Out of scope

Nothing further — this domain has no remaining gap beyond doc 15's own
already-tracked blockers; this note exists so the promotional list's own
bullet has a corresponding, citable document under this batch's heading.
