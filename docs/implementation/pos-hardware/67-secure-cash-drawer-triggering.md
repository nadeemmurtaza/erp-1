# 67 — Cash-drawer triggering: already scoped to cash tenders, exactly

"Electronic kick-out integrations that synchronize till-drawer opening
exclusively with completed cash transactions" is doc 31's own
`CashDrawer` interface, in doc 31's own words, verbatim: *"`kick()` is
called from `PosSalesService`'s existing tender-completion path, once, per
completed cash tender — never on a card tender, never twice for one
sale."* (`docs/implementation/pos-hardware/31-sector-pos-hardware-integration.md`,
lines 62-66.) The exclusivity to cash, the exactly-once guarantee, and the
integration point (the printer's own drawer-kick pulse or a direct
WebUSB/serial connection) are all already specified and already scheduled
as WO-31's own work. This document is a coverage note confirming there is
no remaining gap, not a new specification.

## 1. What "exclusively with completed cash transactions" already means here

- **Never on a card tender** — doc 31 states this outcome directly; the
  `kick()` call site is inside the cash-tender branch of
  `PosSalesService`'s completion path, structurally unreachable from a
  card/digital tender branch, never a runtime conditional a bug could flip.
- **Never twice for one sale** — doc 31's own idempotency framing ("once,
  per completed cash tender") means the call happens exactly once at the
  single point a cash sale transitions to completed, not once per UI
  render or once per retry.
- **Degrades safely with no hardware** — doc 31's own absent-collaborator
  answer: "with no `ReceiptPrinter`/`CashDrawer` registered... both
  silently no-op" — a site with no drawer hardware at all completes cash
  sales normally, the kick call simply resolves to nothing.
- **Failure is visible, not silent** — doc 31's own failure-path lens: "a
  drawer-kick failure [is] a visible retry action, logged, and never
  silently swallowed" — a cashier is told the drawer didn't open and can
  retry or open it manually, rather than believing it opened when it did
  not.

## Scope lenses

Not repeated — doc 31's own scope lenses already answer every lens for
this exact mechanism (the actor being the hardware itself via a driver
interface, the toxic-pair-equivalent guard being "never on card, never
twice," the absent-collaborator answer, the failure path) and this
document introduces no new schema, permission, or write path.

## Work orders

None against `hr-attendance`, `pos`, or any other module — this document
records that the request is already fully specified by doc 31's own
`CashDrawer` interface and `PosSalesService` integration point (WO-31.x),
due to ship as part of doc 31's own work order set, not duplicated here.

## Acceptance

- A completed cash sale triggers exactly one `kick()` call, proven by
  doc 31's own acceptance criteria and specs for that work order.
- A card/digital-wallet sale never triggers `kick()`, proven the same way.
- A drawer-kick failure is surfaced to the cashier as a visible, retryable
  state, never silently absorbed.

## Out of scope

Nothing further — this domain is fully covered by doc 31; this note exists
only so the promotional feature list's own bullet has a corresponding,
citable document rather than appearing unaddressed.
