# 96 — No-deploy policy changes: already real for tax and approval chains; a visual designer is doc 63's own named, deferred boundary

"Enable administrators to update approval chains or business rules via a
visual interface without requiring engineering deployments or manual code
commits" names its own example — approval chains — which is doc 63's
own mechanism, built this same documentation effort. The core promise
("without requiring engineering deployments") is already true for every
policy this repository stores as a data row rather than a code constant
(per doc 95); what is not yet true, and what doc 63 already named
explicitly as deferred, is a drag-and-drop *visual designer* for building
an approval chain's shape from scratch.

## What already delivers "no engineering deployment" today

- **`TaxRate`** (doc 15) — "effective-dated so a GST rate change doesn't
  rewrite history... an order snapshots the rate it was charged." A tax
  rate change is an admin form submission at `/admin/tax`, not a code
  deploy, and old orders remain correct because they already snapshotted
  the rate in effect when placed.
- **`ApprovalChain`/`ApprovalStep`'s own tier count** (doc 63) — "the
  number of tiers a given subject type and value requires... a client's
  own configurable policy row, not a hardcoded constant." Changing how
  many approval tiers a leave request over a threshold needs is a policy-
  row edit, never a code change — doc 63's own "The version stamp" lens
  already states the versioning discipline: "a policy change... only
  applies to chains started after the change; an in-flight chain finishes
  under the tier count it started with."

## The one honest, already-named gap: a visual chain *designer*

Doc 63's own "Out of scope" section states this precisely: **"A visual
chain-designer UI for org admins to build arbitrary chains — the number
of tiers and their resolution rule ships as a small, documented policy
configuration per subject type in this pass; a general-purpose
workflow-builder is a distinct, much larger capability not requested
here."** This bullet's phrase "via a visual interface" is, read
generously, satisfied by the admin *form* that edits an existing chain's
tier count/threshold (which doc 63's own WO-63.5 UI already includes) —
but a true drag-and-drop designer for building a *new kind* of chain
shape from nothing remains the larger, unbuilt capability doc 63 already
named and declined to build without a concrete requirement.

## Scope lenses

Not repeated — doc 15 and doc 63 each already carry a complete scope-lens
treatment for their own mechanisms; this document introduces nothing new.

## Work orders

None beyond what doc 15/doc 63 already specify. If a concrete client
requirement for a general-purpose visual workflow designer emerges (not
this promotional bullet restating doc 63's own already-declined scope), it
is its own separately-scoped document, per doc 63's own explicit
boundary — never built speculatively.

## Acceptance

- No schema or code change — verified by citation to doc 15 and doc 63's
  existing mechanisms.
- A tax-rate or approval-tier-count change requires no engineering
  deployment, proven by the existing admin screens each already ships.

## Out of scope

A general-purpose, drag-and-drop visual workflow/rule designer — named
above as doc 63's own already-declined scope; restated here rather than
silently re-opened by a differently-worded promotional bullet.
