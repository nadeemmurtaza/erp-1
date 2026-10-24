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

**Why:** `PermissionDefinition` (`packages/shared/src/permissions.ts:38-43`) is
`{key, label, category, sensitivity}` — no `conflictsWith` or
`mutuallyExclusiveWith` field exists. `RolesService.create`/`.update`
(`roles.service.ts:60,91`) each call
`assertLockedPermissionsStillHeldSomewhere` (a key orphaned deployment-wide)
and flag duplicate permission sets — neither ever checks whether the incoming
`permissions` array contains a *pair*.
`PurchasingService.createPurchaseOrder` and `.receiveGoods`
(`purchasing.service.ts:242,289`) are both gated by the single key
`purchasing.manage`; `receiveGoods` takes `userId` with no comparison to the
PO's `createdById`.

**Worked example:** Narrow slice: ship `receiveGoods()` because the stock and
weighted-average-cost math is correct. Complete capability: state that
`purchasing.manage` lets one buyer both fabricate a PO and post its receipt,
with nothing in `RolesService` or `scope.guard.ts` flagging the pairing —
then either split the key or name why not.

**Done test:** `grep -n "conflict\|mutuallyExclusive" packages/shared/src/permissions.ts apps/api/src/core/auth/roles.service.ts` returns nothing today; the PR either adds the field and a check in `RolesService.create`/`.update` that uses it, or its description names the specific pair and states it is accepted risk.

**Breaks without:** One buyer role inflates `ProductVariant.costPrice` and
receives phantom stock against a self-issued PO; across 100+ locations
nothing distinguishes a legitimate receipt from a self-dealt one until a
physical count finds the gap.

## Lens: Detected at grant or at act

**Question:** For this feature's toxic pair, state which one check exists —
a grant-time check (`RolesService.create`/`.update` refuses a `permissions`
array holding both keys) or an act-time check (the action throws when the
actor matches a stored id on the record) — and where in the diff it lives.

**Why:** `PaymentsService.approve(actorId, paymentId, note)`
(`payments.service.ts:229`) stamps `approvedById: actorId` on the `Payment`
row at line 243 but never reads `order.placedById` or any other actor to
compare against. `payments.approve` (`permissions.ts:83`) is a flat key
checked by the guard's pure OR — holding it is sufficient, regardless of
what else the holder did on that order. Note: there is no
`RolesService.assignRole` method — role grants are only ever set via
`RolesService.create` (new role) or `.update` (edit an existing role's
`permissions` array); a fix lives in one of those two, not in a
grant-assignment method that does not exist.

**Worked example:** Narrow slice: add the `payments.approve` key and call
refund-approval done. Complete capability: pick one enforcement point and
build it — either `RolesService.create`/`.update` refuses saving a role that
holds `payments.approve` alongside `orders.manage`, or
`PaymentsService.approve` throws when `actorId` equals the order's placing
user — because today neither exists and `approve()` accepts any caller
holding the key.

**Done test:** A test calls `approve()` with `actorId` equal to the id that
placed the underlying order; it must throw (act-time), or a
`RolesService.update` call assembling both keys on one role must be rejected
(grant-time). The PR states which and the test file that proves it.

**Breaks without:** A till user places an order, takes the payment, and
self-approves its refund on one login; `AuditLog`
(`apps/api/prisma/schema/core.prisma:220`) records three ordinary-looking
actions with no field marking the sequence as a conflict, so the fraud reads
as routine.

## Lens: Who counts the drawer they held

**Question:** Name the field that would prove a different person closed and
reconciled a POS shift than the one who opened it and moved its cash, and
say what `closeShift`/`zReport` actually compare today.

**Why:** `PosShiftsService.openShift(terminalId, openedByUserId, ...)`
(`pos-shifts.service.ts:32`) and `.closeShift(shiftId, closedByUserId, ...)`
(`:72`) never compare `closedByUserId` to `shift.openedByUserId`;
`recordCashMovement` (`:55`) takes any `actorId`. A single key,
`pos.operate`, is applied at the controller class level
(`pos-shifts.controller.ts:17`), gating opening, moving cash, and closing —
there is no separate reconcile/count key.

**Worked example:** Narrow slice: ship `zReport()` because `expectedCashMinor`
(computed in `breakdown()`, `pos-shifts.service.ts:107-131`) and
`overShortMinor` (`:103`) compute correctly. Complete capability: the same
`pos.operate` holder who opened the shift, recorded every `CASH_OUT`/`DROP`,
and caused a shortfall can also close the shift and read the Z-report that
would expose them — nothing requires a second person.

**Done test:** `grep -n "openedByUserId" apps/api/src/modules/pos/pos-shifts.service.ts` shows `closeShift` never reads it for comparison; the PR either adds that comparison behind a distinct permission or its description states cash-count SoD is out of scope for this shift model and why.

**Breaks without:** At 100+ till locations run by walk-in till users, a
shortfall never surfaces in the Z-report because the person who caused it
also signs off on it before that day's cash posts to `1000 Cash & Bank`
(`chart-of-accounts.ts:20`) — no second count exists to catch it first.

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

## Hardening record

**Kept (all three survive, sharpened):**

- *The conflict matrix has no home* — grounded in
  `PermissionDefinition` (`packages/shared/src/permissions.ts:38-43`, no
  `conflictsWith` field) and `RolesService.create`/`.update`
  (`roles.service.ts:60,91`), which only run the orphan/duplicate checks,
  never a pair check. Kept because it forces a named toxic pair and a named
  file, not a general "add RBAC" statement.
- *Detected at grant or at act* — grounded in `PaymentsService.approve`
  (`payments.service.ts:229,243`) and the flat-OR `payments.approve` key.
  Kept, with the `RolesService.assignRole` citation corrected (see below) —
  the underlying claim (no grant-time or act-time SoD check exists for this
  key) still holds against the real methods.
- *Who counts the drawer they held* — grounded in
  `PosShiftsService.openShift`/`closeShift`/`recordCashMovement`
  (`pos-shifts.service.ts:32,55,72`) and the class-level `pos.operate` guard
  (`pos-shifts.controller.ts:17`). Kept unchanged in substance; citations
  tightened to exact line numbers.

**Killed:** none. All three lenses are scope questions (which permission
pairing a feature must resolve), not restatements of the five original
lenses or the thirty WO-22 lenses — none of those addresses toxic-pair
detection, grant-vs-act timing, or maker/checker on a single business
object — and all three name a real, currently-missing check rather than
generic "add access control" advice.

**Citations corrected:**

- Lens 2 ("Detected at grant or at act") named `RolesService.assignRole` as
  a candidate grant-time enforcement point. No such method exists — grepped
  `apps/api/src/core/auth/roles.service.ts` and confirmed the only two
  methods that write a role's `permissions` are `create` (line 60) and
  `update` (line 91). Corrected: claimed `RolesService.assignRole`, actual
  `RolesService.create`/`RolesService.update`.
- Lens 3's worked example attributed both `expectedCashMinor` and
  `overShortMinor` to `pos-shifts.service.ts:107-131`. Read the file:
  `expectedCashMinor` is computed inside the private `breakdown()` method at
  line 128 (within 107-131), but `overShortMinor` is computed in `zReport()`
  itself at line 103, outside that range. Corrected: claimed both at
  `:107-131`, actual `expectedCashMinor` at `:128` (inside `breakdown()`,
  `:107-131`) and `overShortMinor` at `:103` (inside `zReport()`).
- All other citations — `PermissionDefinition` fields, `pos.operate`
  (`permissions.ts:77`) and `payments.approve` (`:83`) key definitions,
  `purchasing.manage` gating both `createPurchaseOrder` and `receiveGoods`
  (confirmed via `purchasing.controller.ts` decorators), the `AuditLog`
  model (`core.prisma:220`), and the `1000 Cash & Bank` account
  (`chart-of-accounts.ts:20`) — were opened and verified as claimed; no
  further correction needed.
