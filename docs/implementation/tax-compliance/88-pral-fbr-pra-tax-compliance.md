# 88 — A third/fourth `FiscalComplianceProvider`, not a new integration architecture

"Integration with PARL alongside the FBR and PRA for comprehensive
Pakistani tax compliance" names three authorities where doc 15
(`15-tax-module.md`) already names two of them explicitly, on the
identical extension point, with the identical caution: **WO-15.5** is FBR
e-invoicing ("`FbrProvider`... field payload blocked on real FBR
requirements") and **WO-15.6** is "PRA (and other provincial authority)
compliance: `PraProvider` on the same `FiscalComplianceProvider`
interface — blocked on real PRA requirements." Doc 15's own interface
already generalizes over `authority: string` ("FBR" | "PRA" | ...) rather
than a closed enum, specifically so a third authority is a new provider
implementation, never a new mechanism. "PARL" most likely refers to
**PRAL** (Pakistan Revenue Automation Limited, FBR's own IT/e-invoicing
arm) rather than a fourth distinct tax authority — either way, it is the
same shape doc 15 already accounts for.

## What doc 15 already specifies, restated rather than re-derived

```ts
// doc 15's own FiscalComplianceProvider interface
interface FiscalComplianceProvider {
  readonly authority: string; // "FBR" | "PRA" | ... — data, never a closed enum
  // submit(), status-check, retry — doc 15's own full shape
}
```

A `PralProvider` (or a `PraProvider` covering PRAL's own e-invoicing
requirements, if that is what "PARL" refers to once confirmed with a real
accountant or the authority's own documentation) is a **fourth
implementation of this identical interface** — the same
`FiscalSubmission` queue, the same retry cron, the same invoice-numbering
discipline doc 15 already specifies ("FBR's series and PRA's series... are
named in the counter key"). Doc 15's own repeated caution applies
identically here: **"get the actual [authority]'s invoicing requirements
from an accountant or the [authority]'s own documentation before
building"** — this document does not guess PRAL's field payload any more
than doc 15 guesses FBR's or PRA's.

## Scope lenses

Not repeated — doc 15's own scope lenses already answer every lens for
the `FiscalComplianceProvider` extension point; a new provider
implementation introduces no new mechanism, only a new registered class.

## Work orders

**WO-88.1 (blocked, same as doc 15's own WO-15.5/15.6)** — confirm with a
real accountant or the relevant authority's own documentation which
specific authority "PARL" refers to and its actual field/submission
requirements, then implement it as a new `FiscalComplianceProvider`
implementation exactly as doc 15's own WO-15.6 already specifies for PRA.
No code ships from this document until that confirmation exists — the
identical discipline doc 15 already imposes on itself for FBR and PRA.

## Acceptance

- No schema or interface change — `FiscalComplianceProvider` already
  supports an arbitrary `authority` string.
- A new provider implementation, once real requirements are confirmed,
  requires no change to `FiscalSubmission`'s queue, retry cron, or
  invoice-numbering scheme.

## Out of scope

Guessing PRAL/PRA's actual field payload from FBR's shape by analogy —
doc 15's own explicit caution against exactly this mistake applies here
without modification.
