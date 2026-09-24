# 46 — FBR/PRA verification QR codes on the printed receipt

This document is the point where two already-scoped pieces meet: doc 15's
`FiscalComplianceProvider` (WO-15.5/15.6, FBR e-invoicing and PRA
compliance — still gated on real requirements) and doc 31's `ReceiptPrinter`
driver (the ESC/POS till hardware layer). A verification QR code is not a
new domain concept; it is **one more thing the receipt template renders**,
once a fiscal authority has actually confirmed a sale — this document adds
the print hook and the honest limit on what it can do before doc 15's own
provider exists for real.

## The QR code cannot be built before doc 15's provider is

A verification QR code encodes whatever the issuing authority's own
verification scheme requires — FBR's own QR payload format, if the
FBR e-invoicing integration is real, is not something to guess at, for the
identical reason doc 15 refuses to guess the invoice field format itself:
**a QR code containing invented data is worse than no QR code**, because it
prints as if the sale were verified when it was not. This document
therefore does not specify a payload — it specifies the seam that makes
adding one, once `FiscalSubmission.referenceNumber` (doc 15) is real, a
receipt-template change and nothing else.

## 1. A receipt renders a QR code only once a fiscal reference actually exists

```ts
// packages/pos-core/src/receipt.ts — additive, no existing field changed

export interface PosReceiptPayload {
  // ...existing fields unchanged...
  /** Set only once FiscalSubmission (doc 15) confirms; absent otherwise —
   *  never a placeholder, never fabricated at print time. */
  fiscalVerification?: {
    authority: string;        // "FBR" | "PRA"
    referenceNumber: string;  // FiscalSubmission.referenceNumber (doc 15)
    /** The exact string/URL the QR encodes — set by whichever
     *  FiscalComplianceProvider implementation issued the reference,
     *  never derived independently here. */
    qrPayload: string;
  };
}
```

`qrPayload` is produced by doc 15's own provider at submission time, not
recomputed by the receipt template — the template only ever renders
whatever payload the authority-specific integration already decided is
correct, keeping this document from ever needing to know FBR's or PRA's
actual QR scheme.

## 2. Printing does not wait on the fiscal authority

A sale completes and prints its receipt through doc 31's existing
`ReceiptPrinter` path **before** doc 15's queued `FiscalSubmission` has
necessarily been acknowledged — `09-ai-layer.md`'s own latency rule,
applied here: nothing on the till floor waits on a government API. Two
honest outcomes, both real:

- **The submission already has a reference by print time** (fast
  authority, or a same-transaction synchronous scheme some jurisdictions
  require) — the QR prints immediately.
- **It does not yet** — the receipt prints without the QR code, and a
  **reprint action** (doc 31's own `printCount`/`printedAt` on
  `PosReceipt`, already built) becomes available once the reference
  arrives, so the customer or the till can produce a QR-bearing copy
  later without the sale itself waiting.

## Scope lenses

**The actor with three tables / The principal with no permission key / The
grant that ends itself** — n/a: no new actor beyond doc 15's own.
**Whose rows, and which columns** — `fiscalVerification` is populated only
from doc 15's own scoped `FiscalSubmission`, inheriting that document's
existing visibility rules; no new column widens who can see what.
**The threshold nobody approves alone / The toxic pair** — n/a.
**Authority and blast radius** — n/a beyond doc 15's own: which
authorities are configured is doc 15's `FiscalComplianceProvider`
registration, not a new decision this document introduces.
**Audience is a capability, not an address** — n/a.
**Request or record** — printing is unchanged (doc 31's own REQUEST/
retry-on-failure shape); the QR's presence is a RECORD of whatever doc 15
already confirmed, never itself refusable.
**The movement with no address / The unwritten posting rule / Every
column or none / The period that already moved / The second legal
entity** — n/a: no new money fact, no new posting; this document only
adds a rendering detail to an existing receipt.
**Dry run before live** — an admin preview screen can render a sample
receipt with a placeholder QR clearly marked "SAMPLE — not a real fiscal
reference" for template design purposes, never mistakable for a live one.
**Three silhouettes** — Solo/Chain without doc 15 enabled: no QR ever
renders, receipts unchanged from today. Organization with FBR/PRA live:
every qualifying sale's receipt carries the code, per §2's own timing
rule.
**The absent collaborator** — restated as this document's central
constraint: with doc 15's provider absent or unconfigured,
`fiscalVerification` is simply never set and the receipt template renders
exactly as it does today — no blank space, no broken QR, no placeholder.
**The second copy of the write** — n/a: this document introduces no new
write; it renders a field doc 15 already deduplicates via
`findPostedEntry`-equivalent submission tracking.
**The hundred-thousandth row** — n/a: no new table: `fiscalVerification`
is assembled at render time from doc 15's already-indexed
`FiscalSubmission` lookup by order.
**The reversal document / The undo fan-out / The version stamp** — n/a:
a printed QR is not itself reversed; a corrected fiscal reference (rare,
authority-side) reprints through the existing reprint action with the
updated payload, the original printed copy is not retroactively altered.
**The erasure the ledger cannot obey** — n/a beyond doc 15's own fiscal-
record retention, which this document inherits unchanged.
**The failure path** — restated as §2: a missing fiscal reference at
print time is not a failure of printing, it degrades to "no QR yet,
reprint available," never blocks the sale or the receipt.

## Work orders

**WO-46.1 — `PosReceiptPayload.fiscalVerification`** (additive field) +
QR rendering in the receipt template, using an existing, already-vetted
QR-generation library (no new custom QR encoder).
**WO-46.2 — reprint-on-reference-arrival**: the existing reprint action
(doc 31) picks up a since-confirmed `FiscalSubmission` reference
automatically, no new screen.
**WO-46.3 — sample/preview mode** for template design, clearly marked
non-fiscal.

## Acceptance

- A receipt printed before a fiscal reference exists renders with no QR
  code and no visual gap where one would go.
- A reprint after the reference arrives includes the QR code, using the
  exact `qrPayload` doc 15's provider produced — never independently
  recomputed.
- With doc 15's provider absent, the receipt template is byte-identical to
  today's, proven by a snapshot test.
- The sample/preview QR is visually and textually distinguishable from a
  real one.

## Out of scope

The actual FBR/PRA QR payload specification — doc 15's own province, not
repeated or guessed here. QR codes on any document other than the POS
receipt (an emailed invoice, a storefront order confirmation) — named as a
natural future extension of the same `fiscalVerification` field once a
real need for it exists, not built speculatively now.
