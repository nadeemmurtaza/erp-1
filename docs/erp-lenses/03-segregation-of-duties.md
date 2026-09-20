# 03. Segregation of duties

A shop trusts the one person behind the counter; a corporate group cannot,
because 100+ actors and 100+ named roles turn "trusted individual" into
"whoever currently holds this permission key." At that scale a feature is
incomplete until it states which permission pairs are toxic together, and
whether the codebase catches the violation when a role is granted or only
after the conflicting action has already happened.

## Lens: The conflict matrix has no home

**Question:** Name the toxic permission-key pair this feature creates (which
two capabilities must never sit in one grant), and the file where that pair
is checked — at role-save time or nowhere.

**Why:** `PermissionDefinition` (`packages/shared/src/permissions.ts`) is
`{key, label, category, sensitivity}` — no `conflictsWith` or
`mutuallyExclusiveWith` field exists. `RolesService` (`roles.service.ts`)
checks only `assertLockedPermissionsStillHeldSomewhere` (a key orphaned
deployment-wide) and flags duplicate permission sets — it never checks a
pair. `PurchasingService.createPurchaseOrder` and `.receiveGoods`
(`purchasing.service.ts:242,289`) are both gated by the single key
`purchasing.manage`; `receiveGoods` takes `userId` with no comparison to the
PO's `createdById`.

**Worked example:** Narrow slice: ship `receiveGoods()` because the stock and
weighted-average-cost math is correct. Complete capability: state that
`purchasing.manage` lets one buyer both fabricate a PO and post its receipt,
with nothing in `RolesService` or `scope.guard.ts` flagging the pairing —
then either split the key or name why not.

**Done test:** `grep -n "conflict\|mutuallyExclusive" packages/shared/src/permissions.ts apps/api/src/core/auth/roles.service.ts` returns nothing today; the PR either adds the field and a check that uses it, or its description names the specific pair and states it is accepted risk.

**Breaks without:** One buyer role inflates `ProductVariant.costPrice` and
receives phantom stock against a self-issued PO; across 100+ locations
nothing distinguishes a legitimate receipt from a self-dealt one until a
physical count finds the gap.

## Lens: Detected at grant or at act

**Question:** For this feature's toxic pair, state which one check exists —
a grant-time check (a role holding both keys is refused at
`RolesService.assignRole`/creation) or an act-time check (the action throws
when the actor matches a stored id on the record) — and where in the diff
it lives.

**Why:** `PaymentsService.approve(actorId, paymentId, note)`
(`payments.service.ts:229`) stamps `approvedById: actorId` on the `Payment`
row but never reads `order.placedById` or any other actor to compare
against. `payments.approve` (`permissions.ts:83`) is a flat key checked by
`PermissionsGuard`'s pure OR — holding it is sufficient, regardless of what
else the holder did on that order.

**Worked example:** Narrow slice: add the `payments.approve` key and call
refund-approval done. Complete capability: pick one enforcement point and
build it — either `RolesService` refuses assigning `payments.approve`
alongside `orders.manage` to the same user, or `PaymentsService.approve`
throws when `actorId` equals the order's placing user — because today
neither exists and `approve()` accepts any caller holding the key.

**Done test:** A test calls `approve()` with `actorId` equal to the id that
placed the underlying order; it must throw (act-time) or the role
assignment attempt must be rejected before that call is reachable
(grant-time). The PR states which.

**Breaks without:** A till user places an order, takes the payment, and
self-approves its refund on one login; `AuditLog` (`audit.service.ts`)
records three ordinary-looking actions with no field marking the sequence
as a conflict, so the fraud reads as routine.

## Lens: Who counts the drawer they held

**Question:** Name the field that would prove a different person closed and
reconciled a POS shift than the one who opened it and moved its cash, and
say what `closeShift`/`zReport` actually compare today.

**Why:** `PosShiftsService.openShift(terminalId, openedByUserId, ...)` and
`.closeShift(shiftId, closedByUserId, ...)` (`pos-shifts.service.ts:32,72`)
never compare `closedByUserId` to `shift.openedByUserId`; `recordCashMovement`
takes any `actorId`. A single key, `pos.operate`
(`permissions.ts:77`), gates opening, moving cash, and closing — there is
no separate reconcile/count key.

**Worked example:** Narrow slice: ship `zReport()` because
`expectedCashMinor` and `overShortMinor` compute correctly
(`pos-shifts.service.ts:107-131`). Complete capability: the same
`pos.operate` holder who opened the shift, recorded every `CASH_OUT`/`DROP`,
and caused a shortfall can also close the shift and read the Z-report that
would expose them — nothing requires a second person.

**Done test:** `grep -n "openedByUserId" apps/api/src/modules/pos/pos-shifts.service.ts` shows `closeShift` never reads it for comparison; the PR either adds that comparison behind a distinct permission or its description states cash-count SoD is out of scope for this shift model and why.

**Breaks without:** At 100+ till locations run by walk-in till users, a
shortfall never surfaces in the Z-report because the person who caused it
also signs off on it before that day's cash posts to `1000 Cash & Bank` —
no second count exists to catch it first.

## Not modelled yet

- No `conflictsWith`/`mutuallyExclusiveWith` field on `PermissionDefinition`
  or any table pairing two permission keys as toxic together.
- No maker-checker field on any model — no `approvedById` is ever compared
  against the actor who created the record it approves (`Payment`,
  `PurchaseOrder`/`GoodsReceipt`, `PosShift` all accept any actor).
- No distinct permission key separating "create" from "receive/approve"
  within one business object (`purchasing.manage`, `pos.operate` each cover
  both ends); splitting them needs new catalog keys and a grant migration,
  per the `seedPermissions`/`seedRoles` gap CLAUDE.md already names.
- No amount-banded or rank-based approval ceiling to attach an SoD rule to —
  `payments.approve` is boolean, and there is no rank/grade model at all
  (confirmed absent in the ground brief).
