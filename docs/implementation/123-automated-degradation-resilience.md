# 123 — Graceful degradation: the "absent collaborator" lens, already answered in every document this session

"Design services to fail gracefully. If a non-critical microservice
crashes, the core transaction ledger and inventory management systems
must continue operating uninterrupted on a localized fallback state"
describes, precisely, the discipline `CLAUDE.md`'s own scope-lens
catalogue names **"The absent collaborator"** — a mandatory lens in
every non-trivial document this repository requires, per `CLAUDE.md`'s
own "Feature scope" section: "Every module this reads, writes or emits
toward that is off by default: what is still recorded, what is not, what
the user sees instead, and whether it degrades on an event or fails Nest
boot." This is not a pattern to adopt; it is already a required section
of every scoping document in this repository, and this document collects
the evidence that it is actually followed, not just required on paper.

## The evidence, collected from this session's own documents

| Optional component absent | Core system's behavior |
|---|---|
| `FaceMatchProvider` unregistered (doc 30) | Attendance continues from other sources; "a correct, silent absence, not an error" |
| `ReceiptPrinter`/`CashDrawer` (doc 31) | A cash sale completes normally; print/kick silently no-op |
| `crm` module off (doc 76) | The POS dashboard's "Total Customers" tile simply omits itself; Daily Sales/Low Stock render normally |
| A notification channel down (doc 24/61) | The underlying record (a bulletin, a leave request) is still created; only the "you have a new item" ping is silent |
| `OutboundConnector`/n8n target down (doc 36/102) | Retried per the outbox's own backoff; the domain event and its originating transaction are entirely unaffected — a failed *notification about* a fact never un-happens the fact itself |

**The core transaction ledger and inventory are never optional
collaborators of anything** — this is the deeper reason "the core...
must continue operating uninterrupted" is already true by construction,
not by a fallback mechanism bolted on afterward: `Order`, `Payment`, and
`InventoryService.move()`/`postUnconditional()` are core modules with no
`MODULES` allowlist toggle at all (`MULTI-SECTOR.md`'s own distinction
between core, which is never optional, and a pack, which always is).
Nothing "non-critical" can ever be positioned upstream of a core write in
this architecture, because module independence (doc 92's own citation)
means a core service never imports a pack's code to begin with — there is
no dependency to fail.

## "A localized fallback state" — this repository's own name for it

Where a genuinely manual fallback is needed during an outage — doc 30's
own "Four hours down" lens, answered identically across attendance,
assets, and every physical-event-recording document this session has
written — the answer is consistently: a paper/manual process captures the
fact, and a subsequent system entry reconciles it once systems return,
never a silent gap in the record.

## Scope lenses

Not repeated — each cited example already carries its own complete
scope-lens treatment, including its own "absent collaborator" answer, in
its own originating document.

## Work orders

None. This document is a collection exercise proving an already-mandatory
discipline is actually followed, not a new mechanism.

## Acceptance

- No schema or code change — verified by citation to the five examples
  above, each independently documented and each independently answering
  this exact lens.
- Every future document in this repository continues to answer "The
  absent collaborator" lens, per `CLAUDE.md`'s own existing requirement —
  restated, not introduced, by this document.

## Out of scope

Nothing further — the discipline this bullet asks for is already
mandatory and already evidenced; this note exists so the promotional
bullet has a citable, evidence-backed answer rather than a bare assertion
that it is "already true."
