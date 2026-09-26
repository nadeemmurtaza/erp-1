# 106 — Finite state machines: already the pattern, per-module today; a shared registry is the one real improvement

> **Status: shipped (2026-09-26), WO-106.1.** `docs/index/cross/state-
> machines.md` is a new generated page, built by a new `scanStateMachines()`
> scanner (`scripts/lib/index-scan.mjs`) wired into `scripts/build-index.mjs`
> — it walks every TypeScript file in `apps/api/src`, finds every named
> `Record<XStatus, XStatus[]>`-shaped constant (the type parameter must be
> PascalCase and end in `Status`/`State`, which is what actually
> distinguishes a real transition table from an unrelated same-shaped map
> like a plain `Record<string, string[]>`), and quotes its literal source —
> never a second, hand-copied enforcement path, and never runtime-editable.
> One correction to this document's own claim, found while building it:
> `PayRunStatus` and `TicketStatus` do **not** "follow the identical shape."
> `PayRunService` enforces its own transitions (`DRAFT`→`APPROVED`→`POSTED`)
> through scattered inline checks per method (`if (run.status !== 'DRAFT')
> throw ...` in `approve()`, `post()`, …), never a single named table — a
> different, equally valid enforcement shape, just not this one. `doc 64`
> and `TicketStatus` do not exist in this codebase at all. The generated
> page states this limitation honestly in its own text rather than
> claiming a completeness the scanner cannot have.

"Abstract the lifecycle of core operational entities (Invoices, Shipments,
Purchase Orders) into configurable state machines. Instead of hardcoding
transitions, define valid paths... in a centralized registry that
administrators can modify" describes exactly the shape
`OrdersService`'s own `ALLOWED_TRANSITIONS` (`orders.service.ts`, lines
58-66) already is: a named, explicit map of `OrderStatus` to its valid
next states, checked before every transition, never an implicit or
inferred jump. What does not exist is a **shared, cross-module registry**
naming every entity's own FSM in one place — each module defines its own
transition table today, correctly scoped to its own module (per module
independence), but with no single inventory of "every state machine in
this system" for an operator to audit at once.

## What already exists, cited rather than re-derived

```ts
// orders.service.ts — the exact shape the bullet describes, already real
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['READY_TO_SHIP', 'CANCELLED'],
  READY_TO_SHIP: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED', 'RETURNED'],
  DELIVERED: ['RETURNED'],
  CANCELLED: [],
  RETURNED: [],
};
```

Every transition attempt is checked against this table before the write —
"instead of hardcoding transitions" is backwards: the table *is* how this
repository avoids hardcoding a transition check inline at every call
site; the alternative the bullet seems to imagine (an ad hoc `if` chain
scattered across the codebase) is exactly what this pattern already
prevents.

## The one real improvement: a read-only cross-module registry, never a runtime-editable one

**"That administrators can modify"** is the one place this document
declines to follow the bullet literally, and states why: a state
machine's valid transitions are not a client-varying *policy* the way a
tax rate or a leave-approval tier count is — they are a **structural
invariant** of the entity's own lifecycle, enforced by the code paths that
act on each state (e.g., `DELIVERED` is the exact status
`OrderEconomicsService` keys its computation on, per doc 68's own
finding this session). Letting an administrator add `PENDING → DELIVERED`
as a valid transition at runtime would silently break every piece of code
that assumes the intermediate states happened — a metaphorical
"skip staging and payment review because the button was clicked," the
same class of risk `CLAUDE.md`'s own "a shop that can jump an order
straight from PENDING to DELIVERED loses the ability to answer 'where is
my parcel'" comment already warns against, in the very same file.

What genuinely is a policy, and genuinely can be administrator-editable,
is *when* a transition is allowed to happen (an approval-chain gate before
`APPROVED`, per doc 63) — never *which* transitions structurally exist.

```ts
// A read-only, cross-module inventory — not a second enforcement
// mechanism, purely a discovery/audit surface:
interface StateMachineRegistryEntry {
  entityType: string;             // "Order", "PayRun", "SupportTicket"
  transitions: Record<string, string[]>;  // each module's own existing table, referenced, never copied
}
```

## Scope lenses

Not repeated — no new schema or write path; the one real named transition
table this document builds on (`orders.service.ts`'s own
`ALLOWED_TRANSITIONS`) already carries its own scope-lens treatment in its
originating document.

## Work orders

**WO-106.1 — a read-only cross-module registry page** in `docs/index/`
(a natural fit for the existing generated-index convention) or an admin
diagnostics screen listing every module's own transition table, for
operator visibility — never a second enforcement path, and never
runtime-editable.

## Acceptance

- No schema or enforcement change — every existing `ALLOWED_TRANSITIONS`-
  shaped table remains the sole authority for its own entity.
- The registry, once built, lists every state machine expressed as a named
  `Record<XStatus, XStatus[]>` table, generated from the code (per the
  existing `docs/index/` convention) rather than hand-maintained and liable
  to drift — and says so honestly for the enforcement shape it structurally
  cannot see (scattered inline checks with no single named table), rather
  than silently omitting those entities with no explanation.

## Out of scope

Making any entity's structural transition table administrator-editable at
runtime — explicitly declined above as unsafe: a transition table is a
code-level invariant other code depends on, never a policy row.
