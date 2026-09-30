# 123 — Graceful degradation: the "absent collaborator" lens, already answered in every document this session

> **Status (2026-09-30): re-verified against real code, and corrected —
> three of the original five citations described a mechanism that isn't
> actually built or a scenario that can't occur, found by checking each
> row against the repository rather than trusting the doc's own prior
> text.** `FaceMatchProvider` is not implemented anywhere — the one place
> it's mentioned (`camera-people-count.registry.ts:13`) is a comment
> pointing at doc 30's own separate design, not working code; replaced
> below with the real, tested extension point in that same file.
> "`crm` module off" cannot happen at all: `apps/api/src/modules/
> module-packs.ts:74` classifies `crm` as **`core`**, never a pack, so
> `Contact`/`totalCustomers` is never an absent collaborator to begin
> with — removed, not replaced, since there is no real scenario to cite
> for it, and doing so is itself an instance of this document's own
> deeper point ("core... never optional"). `OutboundConnector` (doc 36)
> still does not exist in this codebase (confirmed again via
> `core/resilience/circuit-breaker.service.ts`'s own header comment,
> which says exactly this while explaining why it isn't wrapped) —
> replaced with a real, freshly-tested case from the now-built doc 38.
> The two citations that were already accurate (`ReceiptPrinter`/
> `CashDrawer`, the notification fan-out) are unchanged below, now with
> exact file citations.

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
| `CameraPeopleCountProvider` unregistered (doc 156 §4, `apps/api/src/core/extension-points/camera-people-count.registry.ts`) | `countForDate()` resolves to `null`; the loss-prevention report degrades to an explicit "not available" state, never a fabricated ratio |
| `ReceiptPrinter`/`CashDrawer` (doc 31, built — `apps/pos/src/lib/hardware.ts`) | A cash sale completes normally; `printReceipt()`/`kickCashDrawer()` resolve to `{ printed: false }`/`{ kicked: false }` with nothing registered, never throw |
| `AiProvider`/`VectorStore` unreachable (doc 38, built — `ai.service.spec.ts`, `rag-retrieval.service.spec.ts`) | The circuit trips and every AI/RAG feature falls back to its stated non-AI path; every other feature is unaffected |
| A notification channel down (doc 24/61) | The underlying record (a bulletin, a leave request) is still created; only the "you have a new item" ping is silent — `notifications.service.ts`'s `Promise.all`-per-channel fan-out, proven with a throwing channel by doc 38's own new test |
| A replication parent unreachable (`RETAIL-ERP.md` R5/R9, `replication-sync.agent.spec.ts`) | The branch's own local sale, stock and attendance all still record; facts queue for sync and policy reads fall back to the last-cached value — the agent never throws when the parent is unreachable |

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
