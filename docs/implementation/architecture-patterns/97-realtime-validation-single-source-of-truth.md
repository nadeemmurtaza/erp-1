# 97 — Real-time validation against one source of truth: already the standing discipline, not a new gate

"Ensure all internal modules and external API calls validate against this
single source of truth before finalizing transactions or state changes"
describes a discipline this repository already enforces at three
different layers, each already documented elsewhere in this batch set and
in `CLAUDE.md` itself — never a "single source of truth" *engine* to
build, since the single source of truth for each fact is simply that
fact's own owning table, checked at the moment of write.

## The three layers already doing this

- **Server-side validation on every request** — `CLAUDE.md`'s own "API
  Gateway" mapping states the mechanism plainly: "a global
  `ValidationPipe`... on the single NestJS entrypoint." Every DTO across
  every controller is validated by `class-validator` before a handler
  ever runs, and every route's access is checked by `PermissionsGuard`
  before any write proceeds — validation happens before finalization, on
  every call, with no client-side check ever trusted in its place
  (`.claude/rules/security.md`'s own standing rule).
- **Predicate-on-write, not a nightly reconciliation** — House Rule 10
  (cited throughout doc 32/71's own lot/stock work) is exactly "real-time
  validation against the single source of truth": a stock deduction
  checks the actual current row at the moment of write, inside the same
  transaction, never against a cached or eventually-consistent copy.
  `InventoryService.move()` is the one writer this check lives inside —
  restated by doc 70's own coverage note this same batch set.
- **Snapshot-at-write-time for anything that could otherwise drift** —
  `TaxRate` (doc 15), `PayRunLine.deductions` (doc 40), `BomProductionRun`'s
  own cost fields (doc 71) all validate against the *current* policy row
  at the moment of the transaction and then freeze that value — the
  "single source of truth" is checked in real time exactly once, at the
  moment it matters, never re-derived later from a rule that may have
  since changed (which would make yesterday's transaction retroactively
  wrong).

## Scope lenses

Not repeated — no new schema, write path, or permission; the
`ValidationPipe`/`PermissionsGuard`/predicate-on-write mechanisms already
carry their own scope-lens treatment across `CLAUDE.md` and the documents
that build on them (doc 15, doc 32, doc 40, doc 70, doc 71).

## Work orders

None. This document is a naming exercise connecting a promotional phrase
to three already-enforced mechanisms.

## Acceptance

- No schema or code change — verified by citation to the global
  `ValidationPipe`, `PermissionsGuard`, and House Rule 10's own existing
  enforcement.

## Out of scope

A separate, centralized "validation service" that every module calls
before finalizing a transaction — this document names why one is
unnecessary: each fact's own owning table, checked inside its own write
transaction, already is that single source of truth, and centralizing the
check into one service would add an indirection layer with no additional
correctness.
