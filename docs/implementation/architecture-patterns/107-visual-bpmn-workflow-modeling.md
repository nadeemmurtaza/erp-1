# 107 — Visual BPMN workflow design: doc 63's and doc 96's own already-declined scope, restated for a third time

> **Superseded.** Per **ADR-026** (`DECISIONS.md`), the owner reviewed
> this document's reasoning (and doc 63/96's) and explicitly instructed
> that a BPMN engine be built anyway, a fourth time. See **doc 142**,
> which builds it as a visual authoring layer compiling into doc 63's own
> `ApprovalChain`/`ApprovalStep` rows — never a second execution runtime —
> keeping this document's own "two mechanisms for one job" risk closed by
> construction rather than by declining to build.
>
> **Status: verified (2026-09-26).** `ApprovalChain`/`ApprovalStep`
> confirmed real in `apps/api/prisma/schema/approvals.prisma`. This
> document's own reasoning stands on that verified mechanism.

"Allow non-technical operational managers to redraw approval workflows,
document routing, and decision logic using a low-code drag-and-drop
interface" is the same capability doc 63 ("Out of scope: a visual chain-
designer UI... a general-purpose workflow-builder is a distinct, much
larger capability not requested here") and doc 96 ("a visual chain
*designer* is doc 63's own already-named, still-deferred boundary")
already named and declined to build, twice, in this exact document set.
"BPMN" names the specific industry-standard notation such a tool would
use, but does not change the underlying scoping question doc 63 already
answered.

## Why this remains declined, restated once more for this specific framing

A BPMN engine is not a feature — it is a second, general-purpose
execution runtime living inside this application: a graph of nodes and
edges, evaluated at runtime against arbitrary business data, editable by
non-engineers, with its own versioning, its own testing story, and its
own failure modes entirely separate from every typed, reviewed TypeScript
service this repository is built from. Every "workflow" this repository
actually has today — `ApprovalChain`/`ApprovalStep` (doc 63), doc 22's
attendance classification, `OrdersService`'s own transition table (doc
106) — is a small, reviewed, typed piece of code with real tests, not an
interpreted graph a manager drew in a browser. Adopting BPMN would mean
maintaining two ways to express business logic in this codebase
side by side, forever, which is the exact "two mechanisms for the same
thing" trap this repository's own architecture consistently avoids
(doc 82's explicit refusal of a second entitlement mechanism alongside
`MODULES`, doc 95's refusal of a generic rules engine alongside rows-over-
enums).

## What already answers the bullet's own three named use cases

- **"Approval workflows"** — doc 63's `ApprovalChain`/`ApprovalStep`,
  policy-row-configurable (tier count, threshold) without a code deploy.
- **"Document routing"** — doc 28's `EmployeeDocument`
  category/retention-basis model and doc 61's bulletin audience
  resolution already route documents and notices to the right people
  through the org tree, never a manually-drawn diagram.
- **"Decision logic"** — doc 95's own answer: a decision that varies by
  client is a data row (`DeductionType`, `TaxRate`), checked by real,
  reviewed code — never an interpreted rule graph.

## Scope lenses

Not repeated — doc 63's own scope lenses already answer every lens for
the approval-chain mechanism this bullet's "approval workflows" example
names; no new schema or mechanism is introduced here.

## Work orders

None. If a future, concrete requirement genuinely cannot be served by
`ApprovalChain`'s own policy-row configuration (per doc 63) — not this
promotional bullet restating the same ask a third time — that gap is
scoped as its own narrow addition to doc 63's mechanism, never as an
adopted BPMN engine.

## Acceptance

- No schema or code change — verified by citation to doc 63/96's own
  prior, explicit refusal of this exact scope.

## Out of scope

Adopting a BPMN engine or any general-purpose visual workflow-execution
runtime — declined for the third time in this document set, for the
reasons stated above and in doc 63/96.
